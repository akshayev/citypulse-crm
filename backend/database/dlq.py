"""
CityPulse CRM — Dead Letter Queue (DLQ)
Source: 01-System-Architecture.md

Failed scrapes or Gemini timeouts are pushed to dlq_tasks.
Implements exponential backoff retry logic.
The pipeline must never crash on a single failed lead.
"""
import math
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from backend.database.supabase_client import get_supabase_client


async def push_to_dlq(
    task_type: str,
    payload: dict,
    error_message: str,
    max_retries: int = 5
) -> str:
    """
    Push a failed task to the Dead Letter Queue.
    Returns the task_id.
    """
    db = get_supabase_client()
    task_id = str(uuid4())

    # First retry in 30 seconds (exponential backoff starts here)
    next_retry = datetime.now(timezone.utc) + timedelta(seconds=30)

    db.table("dlq_tasks").insert({
        "task_id": task_id,
        "task_type": task_type,
        "payload": payload,
        "error_message": error_message,
        "retry_count": 0,
        "max_retries": max_retries,
        "next_retry_at": next_retry.isoformat(),
        "status": "pending"
    }).execute()

    return task_id


async def get_pending_retries() -> list:
    """Get all DLQ tasks that are due for retry."""
    db = get_supabase_client()
    now = datetime.now(timezone.utc).isoformat()

    result = (
        db.table("dlq_tasks")
        .select("*")
        .eq("status", "pending")
        .lte("next_retry_at", now)
        .execute()
    )

    return result.data or []


async def mark_retrying(task_id: str) -> None:
    """Mark a DLQ task as currently being retried."""
    db = get_supabase_client()
    db.table("dlq_tasks").update({
        "status": "retrying"
    }).eq("task_id", task_id).execute()


async def mark_resolved(task_id: str) -> None:
    """Mark a DLQ task as successfully resolved after retry."""
    db = get_supabase_client()
    db.table("dlq_tasks").update({
        "status": "resolved"
    }).eq("task_id", task_id).execute()


async def mark_failed_retry(task_id: str, error_message: str) -> None:
    """
    Mark a retry as failed and schedule the next retry with exponential backoff.
    If max retries exceeded, mark as permanently failed.
    """
    db = get_supabase_client()

    # Get current retry count
    result = db.table("dlq_tasks").select("retry_count, max_retries").eq("task_id", task_id).execute()

    if not result.data:
        return

    task = result.data[0]
    new_count = task["retry_count"] + 1

    if new_count >= task["max_retries"]:
        # Permanently failed — no more retries
        db.table("dlq_tasks").update({
            "status": "failed",
            "retry_count": new_count,
            "error_message": error_message
        }).eq("task_id", task_id).execute()
    else:
        # Exponential backoff: 30s, 60s, 120s, 240s, 480s...
        delay_seconds = 30 * math.pow(2, new_count)
        next_retry = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)

        db.table("dlq_tasks").update({
            "status": "pending",
            "retry_count": new_count,
            "next_retry_at": next_retry.isoformat(),
            "error_message": error_message
        }).eq("task_id", task_id).execute()
