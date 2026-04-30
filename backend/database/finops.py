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


async def check_gemini_quota() -> int:
    """
    Check if Gemini API calls are within daily quota.
    Returns current count if within quota.
    Raises HTTP 429 if quota exceeded.
    """
    db = get_supabase_client()
    today = date.today().isoformat()

    # Get or create today's usage record
    result = db.table("daily_api_usage").select("*").eq("date", today).execute()

    if not result.data:
        # Create today's record
        db.table("daily_api_usage").insert({
            "date": today,
            "gemini_calls": 0,
            "scraper_runs": 0
        }).execute()
        return 0

    current_calls = result.data[0].get("gemini_calls", 0)

    if current_calls >= settings.max_gemini_calls_per_day:
        raise HTTPException(
            status_code=429,
            detail=f"Daily Gemini API quota reached ({settings.max_gemini_calls_per_day} calls). "
                   f"Try again tomorrow."
        )

    return current_calls


async def increment_gemini_calls() -> int:
    """Increment the Gemini API call counter for today. Returns new count."""
    db = get_supabase_client()
    today = date.today().isoformat()

    result = db.table("daily_api_usage").select("gemini_calls").eq("date", today).execute()

    if not result.data:
        db.table("daily_api_usage").insert({
            "date": today,
            "gemini_calls": 1,
            "scraper_runs": 0
        }).execute()
        return 1

    new_count = result.data[0]["gemini_calls"] + 1
    db.table("daily_api_usage").update({
        "gemini_calls": new_count
    }).eq("date", today).execute()

    return new_count


async def check_scraper_quota() -> int:
    """Check if scraper runs are within daily quota."""
    db = get_supabase_client()
    today = date.today().isoformat()

    result = db.table("daily_api_usage").select("*").eq("date", today).execute()

    if not result.data:
        db.table("daily_api_usage").insert({
            "date": today,
            "gemini_calls": 0,
            "scraper_runs": 0
        }).execute()
        return 0

    current_runs = result.data[0].get("scraper_runs", 0)

    if current_runs >= settings.max_scraper_runs_per_day:
        raise HTTPException(
            status_code=429,
            detail=f"Daily scraper quota reached ({settings.max_scraper_runs_per_day} runs). "
                   f"Try again tomorrow."
        )

    return current_runs


async def increment_scraper_runs() -> int:
    """Increment the scraper run counter for today."""
    db = get_supabase_client()
    today = date.today().isoformat()

    result = db.table("daily_api_usage").select("scraper_runs").eq("date", today).execute()

    if not result.data:
        db.table("daily_api_usage").insert({
            "date": today,
            "gemini_calls": 0,
            "scraper_runs": 1
        }).execute()
        return 1

    new_count = result.data[0]["scraper_runs"] + 1
    db.table("daily_api_usage").update({
        "scraper_runs": new_count
    }).eq("date", today).execute()

    return new_count


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
