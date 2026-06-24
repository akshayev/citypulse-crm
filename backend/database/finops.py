"""
CityPulse CRM — FinOps Limiter
Source: 03-Security-and-Compliance.md

Checks daily_api_usage table before any third-party API call.
Hard blocks at quota with HTTP 429.
"""

from datetime import date
import logging
from typing import Any
from fastapi import HTTPException
from backend.database.supabase_client import get_supabase_client
from backend.config import settings

logger = logging.getLogger(__name__)


def _rpc_allowed(result_data: Any) -> bool:
    """Normalize RPC return payloads to a strict allow/deny boolean."""
    if result_data is None:
        return False

    if isinstance(result_data, list):
        if not result_data:
            return False
        first_item = result_data[0]
        if isinstance(first_item, dict):
            if "allowed" in first_item:
                return bool(first_item["allowed"])
            if len(first_item) == 1:
                return bool(next(iter(first_item.values())))
        return bool(first_item)

    if isinstance(result_data, dict):
        if "allowed" in result_data:
            return bool(result_data["allowed"])
        if len(result_data) == 1:
            return bool(next(iter(result_data.values())))

    return bool(result_data)


async def check_and_increment_gemini_quota() -> bool:
    """
    Atomically checks and increments Gemini quota via Postgres RPC.
    Raises HTTP 429 if quota exceeded.
    """
    db = get_supabase_client()
    try:
        result = db.rpc(
            "increment_gemini_calls", {"max_calls": settings.max_gemini_calls_per_day}
        ).execute()

        if not _rpc_allowed(result.data):
            raise HTTPException(
                status_code=429,
                detail=f"Daily Gemini API quota reached ({settings.max_gemini_calls_per_day} calls). Try again tomorrow.",
            )
        return True
    except HTTPException:
        raise
    except Exception as e:
        # Fallback to non-atomic check if RPC fails/doesn't exist
        logger.warning(
            f"RPC increment_gemini_calls failed: {e}. Falling back to non-atomic check."
        )
        return await _fallback_check_gemini()


async def _fallback_check_gemini():
    db = get_supabase_client()
    today = date.today().isoformat()
    result = db.table("daily_api_usage").select("*").eq("date", today).execute()

    if not result.data:
        db.table("daily_api_usage").insert(
            {"date": today, "gemini_calls": 1, "scraper_runs": 0}
        ).execute()
        return True

    current = result.data[0].get("gemini_calls", 0)
    if current >= settings.max_gemini_calls_per_day:
        raise HTTPException(
            status_code=429,
            detail=f"Daily Gemini API quota reached ({settings.max_gemini_calls_per_day} calls).",
        )

    db.table("daily_api_usage").update({"gemini_calls": current + 1}).eq(
        "date", today
    ).execute()
    return True


async def check_and_increment_scraper_quota() -> bool:
    """
    Atomically checks and increments scraper quota via Postgres RPC.
    Raises HTTP 429 if quota exceeded.
    """
    db = get_supabase_client()
    try:
        result = db.rpc(
            "increment_scraper_runs", {"max_runs": settings.max_scraper_runs_per_day}
        ).execute()

        if not _rpc_allowed(result.data):
            raise HTTPException(
                status_code=429,
                detail=f"Daily scraper quota reached ({settings.max_scraper_runs_per_day} runs). Try again tomorrow.",
            )
        return True
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(
            f"RPC increment_scraper_runs failed: {e}. Falling back to non-atomic check."
        )
        return await _fallback_check_scraper()


async def _fallback_check_scraper():
    db = get_supabase_client()
    today = date.today().isoformat()
    result = db.table("daily_api_usage").select("*").eq("date", today).execute()

    if not result.data:
        db.table("daily_api_usage").insert(
            {"date": today, "gemini_calls": 0, "scraper_runs": 1}
        ).execute()
        return True

    current = result.data[0].get("scraper_runs", 0)
    if current >= settings.max_scraper_runs_per_day:
        raise HTTPException(
            status_code=429,
            detail=f"Daily scraper quota reached ({settings.max_scraper_runs_per_day} runs).",
        )

    db.table("daily_api_usage").update({"scraper_runs": current + 1}).eq(
        "date", today
    ).execute()
    return True


# Keep these for backwards compatibility if needed elsewhere
async def check_gemini_quota() -> int:
    return 0  # Handled by check_and_increment


async def increment_gemini_calls() -> int:
    return 0  # Handled by check_and_increment


async def check_scraper_quota() -> int:
    return 0  # Handled by check_and_increment


async def increment_scraper_runs() -> int:
    return 0  # Handled by check_and_increment


async def get_daily_usage() -> dict:
    """Get the full daily usage stats for the admin dashboard."""
    db = get_supabase_client()
    today = date.today().isoformat()

    result = db.table("daily_api_usage").select("*").eq("date", today).execute()

    if not result.data:
        return {
            "date": today,
            "gemini_calls": 0,
            "scraper_runs": 0,
            "gemini_limit": settings.max_gemini_calls_per_day,
            "scraper_limit": settings.max_scraper_runs_per_day,
        }

    data = result.data[0]
    return {
        "date": today,
        "gemini_calls": data.get("gemini_calls", 0),
        "scraper_runs": data.get("scraper_runs", 0),
        "gemini_limit": settings.max_gemini_calls_per_day,
        "scraper_limit": settings.max_scraper_runs_per_day,
    }
