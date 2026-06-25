"""
CityPulse CRM — Pipeline run tracking.

Records one row per scrape pipeline execution so the frontend can show live
job status and so we have run-level history for observability. All Supabase
calls are wrapped in asyncio.to_thread (the client is blocking).
"""

import asyncio
from datetime import datetime, timezone
from backend.database.supabase_client import get_supabase_client


async def create_run(city: str, niche: str) -> str | None:
    """Create a 'queued' run row; returns its id (or None if it couldn't be created)."""
    db = get_supabase_client()
    result = await asyncio.to_thread(
        db.table("pipeline_runs")
        .insert({"city": city, "niche": niche, "status": "queued"})
        .execute
    )
    if result.data:
        return result.data[0]["id"]
    return None


async def update_run(run_id: str | None, **fields) -> None:
    """Patch a run row. No-op if run_id is None (run tracking is best-effort)."""
    if not run_id or not fields:
        return
    db = get_supabase_client()
    await asyncio.to_thread(
        db.table("pipeline_runs").update(fields).eq("id", run_id).execute
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
