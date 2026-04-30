"""
CityPulse CRM — FinOps Limiter
Source: 03-Security-and-Compliance.md

Checks daily_api_usage table before any third-party API call.
Hard blocks at quota with HTTP 429.
"""
from datetime import date
from fastapi import HTTPException
from backend.database.supabase_client import get_supabase_client
from backend.config import settings


async def check_and_increment_gemini_quota() -> bool:
    """
    Atomically checks and increments Gemini quota via Postgres RPC.
    Raises HTTP 429 if quota exceeded.
    """
    db = get_supabase_client()
    try:
        result = db.rpc(
            "increment_gemini_calls", 
            {"max_calls": settings.max_gemini_calls_per_day}
        ).execute()
        
        # If the RPC doesn't exist yet, fallback to original logic for dev
        if not result.data:
            raise HTTPException(
                status_code=429,
                detail=f"Daily Gemini API quota reached ({settings.max_gemini_calls_per_day} calls). Try again tomorrow."
            )
        return True
    except Exception as e:
        if "429" in str(e):
            raise
        # Fallback to non-atomic check if RPC fails/doesn't exist
        logger = __import__("logging").getLogger(__name__)
        logger.warning(f"RPC increment_gemini_calls failed: {e}. Falling back to non-atomic check.")
        return await _fallback_check_gemini()

async def _fallback_check_gemini():
    db = get_supabase_client()
    today = date.today().isoformat()
    result = db.table("daily_api_usage").select("*").eq("date", today).execute()
    
    if not result.data:
        db.table("daily_api_usage").insert({
            "date": today, "gemini_calls": 1, "scraper_runs": 0
        }).execute()
        return True
        
    current = result.data[0].get("gemini_calls", 0)
    if current >= settings.max_gemini_calls_per_day:
        raise HTTPException(
            status_code=429,
            detail=f"Daily Gemini API quota reached ({settings.max_gemini_calls_per_day} calls)."
        )
    
    db.table("daily_api_usage").update({"gemini_calls": current + 1}).eq("date", today).execute()
    return True

async def check_and_increment_scraper_quota() -> bool:
    """
    Atomically checks and increments scraper quota via Postgres RPC.
    Raises HTTP 429 if quota exceeded.
    """
    db = get_supabase_client()
    try:
        result = db.rpc(
            "increment_scraper_runs", 
            {"max_runs": settings.max_scraper_runs_per_day}
        ).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=429,
                detail=f"Daily scraper quota reached ({settings.max_scraper_runs_per_day} runs). Try again tomorrow."
            )
        return True
    except Exception as e:
        if "429" in str(e):
            raise
        logger = __import__("logging").getLogger(__name__)
        logger.warning(f"RPC increment_scraper_runs failed: {e}. Falling back to non-atomic check.")
        return await _fallback_check_scraper()

async def _fallback_check_scraper():
    db = get_supabase_client()
    today = date.today().isoformat()
    result = db.table("daily_api_usage").select("*").eq("date", today).execute()
    
    if not result.data:
        db.table("daily_api_usage").insert({
            "date": today, "gemini_calls": 0, "scraper_runs": 1
        }).execute()
        return True
        
    current = result.data[0].get("scraper_runs", 0)
    if current >= settings.max_scraper_runs_per_day:
        raise HTTPException(
            status_code=429,
            detail=f"Daily scraper quota reached ({settings.max_scraper_runs_per_day} runs)."
        )
        
    db.table("daily_api_usage").update({"scraper_runs": current + 1}).eq("date", today).execute()
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
            "scraper_limit": settings.max_scraper_runs_per_day
        }

    data = result.data[0]
    return {
        "date": today,
        "gemini_calls": data.get("gemini_calls", 0),
        "scraper_runs": data.get("scraper_runs", 0),
        "gemini_limit": settings.max_gemini_calls_per_day,
        "scraper_limit": settings.max_scraper_runs_per_day
    }
