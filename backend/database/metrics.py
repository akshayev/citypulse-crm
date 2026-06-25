"""
CityPulse CRM — Pipeline metrics & DLQ status (observability).

Aggregates pipeline_runs into funnel/cost/provider metrics and summarizes the
dead-letter queue. Read-only; all Supabase calls run via asyncio.to_thread.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from backend.database.supabase_client import get_supabase_client


async def get_pipeline_metrics(days: int = 30) -> dict:
    """Aggregate the last `days` of pipeline runs into showcase metrics."""
    db = get_supabase_client()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    res = await asyncio.to_thread(
        db.table("pipeline_runs").select("*").gte("started_at", since).execute
    )
    runs = res.data or []

    def _sum(field):
        return sum((r.get(field) or 0) for r in runs)

    bronze, silver, gold = (
        _sum("bronze_count"),
        _sum("silver_count"),
        _sum("gold_count"),
    )
    gemini_calls, groq_calls = _sum("gemini_calls"), _sum("groq_calls")
    total_llm = gemini_calls + groq_calls
    llm_cost = round(sum(float(r.get("llm_cost_usd") or 0) for r in runs), 4)

    totals = {
        "runs": len(runs),
        "runs_done": sum(1 for r in runs if r.get("status") == "done"),
        "runs_failed": sum(1 for r in runs if r.get("status") == "failed"),
        "bronze": bronze,
        "silver": silver,
        "gold": gold,
        "blocked": _sum("blocked_count"),
        "dq_failed": _sum("dq_failed"),
        "gemini_calls": gemini_calls,
        "groq_calls": groq_calls,
        "llm_cost_usd": llm_cost,
    }

    return {
        "window_days": days,
        "totals": totals,
        "funnel": {
            "bronze_to_silver_pct": round(silver / bronze * 100, 1) if bronze else 0.0,
            "silver_to_gold_pct": round(gold / silver * 100, 1) if silver else 0.0,
        },
        "cost_per_1k_leads_usd": round(llm_cost / gold * 1000, 4) if gold else 0.0,
        "provider_split": {
            "gemini_pct": (
                round(gemini_calls / total_llm * 100, 1) if total_llm else 0.0
            ),
            "groq_pct": round(groq_calls / total_llm * 100, 1) if total_llm else 0.0,
        },
    }


async def get_dlq_status() -> dict:
    """Summarize the dead-letter queue by status + oldest pending age."""
    db = get_supabase_client()
    res = await asyncio.to_thread(
        db.table("dlq_tasks").select("status, created_at").execute
    )
    tasks = res.data or []
    by_status: dict[str, int] = {}
    for t in tasks:
        s = t.get("status", "unknown")
        by_status[s] = by_status.get(s, 0) + 1
    pending = [t.get("created_at") for t in tasks if t.get("status") == "pending"]
    oldest_pending_at = min((c for c in pending if c), default=None)
    return {
        "total": len(tasks),
        "by_status": by_status,
        "oldest_pending_at": oldest_pending_at,
    }
