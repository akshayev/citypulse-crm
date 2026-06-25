"""
CityPulse CRM — FastAPI Backend Server
Source: 01-System-Architecture.md, 12-Features-Roadmap.md

The Orchestrator: FastAPI webhooks that securely trigger background
Selenium/SerpApi scrapes based on frontend payloads.
Runs the full Bronze → Silver → Gold pipeline.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from enum import Enum

from backend.config import settings
from backend.scraper.serpapi_client import scrape_google_maps
from backend.ai_pipeline.cleaner import clean_raw_scrape
from backend.ai_pipeline.scorer import score_batch_from_scrape, score_single_lead
from backend.database.finops import (
    check_and_increment_scraper_quota,
    get_daily_usage,
)
from backend.database.dlq import (
    get_pending_retries,
    mark_retrying,
    mark_resolved,
    mark_failed_retry,
    mark_failed_terminal,
)
from backend.database.runs import create_run, update_run, _now
from fastapi import Header, Depends

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


# ============================================================================
# LIFESPAN: Background DLQ retry worker
# ============================================================================


async def dlq_retry_worker():
    """Background worker that retries failed DLQ tasks with exponential backoff."""
    while True:
        try:
            pending = await get_pending_retries()
            for task in pending:
                task_id = task["task_id"]
                task_type = task["task_type"]
                payload = task["payload"]

                logger.info(
                    f"DLQ retry: {task_type} (task_id: {task_id}, attempt: {task['retry_count'] + 1})"
                )
                await mark_retrying(task_id)

                try:
                    # Retries must NOT re-enqueue: pass push_to_dlq_on_error=False
                    # so the handler doesn't create a duplicate DLQ row. The
                    # worker is the single owner of retry bookkeeping below.
                    if task_type == "scrape":
                        result = await scrape_google_maps(
                            **payload, push_to_dlq_on_error=False
                        )
                    elif task_type == "clean":
                        result = await clean_raw_scrape(
                            payload["scrape_id"], push_to_dlq_on_error=False
                        )
                    elif task_type == "score":
                        result = await score_single_lead(
                            payload["place_id"], push_to_dlq_on_error=False
                        )
                    else:
                        await mark_failed_terminal(
                            task_id, f"Unknown task type: {task_type}"
                        )
                        continue

                    status = result.get("status")
                    if status == "success":
                        await mark_resolved(task_id)
                        logger.info(f"DLQ resolved: {task_id}")
                    elif status == "quota_exceeded":
                        # Terminal: retrying won't help until the daily quota
                        # resets; a fresh run should be triggered instead.
                        await mark_failed_terminal(
                            task_id, result.get("error", "quota exceeded")
                        )
                        logger.warning(f"DLQ terminal (quota): {task_id}")
                    else:
                        await mark_failed_retry(
                            task_id, result.get("error", "Unknown error")
                        )
                        logger.warning(
                            f"DLQ retry failed: {task_id} — {result.get('error')}"
                        )

                except Exception as e:
                    # Handler raised unexpectedly — reschedule with backoff.
                    await mark_failed_retry(task_id, str(e))
                    logger.warning(f"DLQ retry crashed: {task_id} — {e}")

        except Exception as e:
            logger.error(f"DLQ worker error: {e}")

        # Check DLQ every 60 seconds
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifespan — starts the DLQ retry worker."""
    task = asyncio.create_task(dlq_retry_worker())
    logger.info("🚀 CityPulse Backend started. DLQ worker running.")
    yield
    task.cancel()
    logger.info("Backend shutting down.")


# ============================================================================
# APP INITIALIZATION
# ============================================================================

app = FastAPI(
    title="CityPulse CRM API",
    description="Event-driven CRM backend with AI-powered lead scoring",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow Next.js frontend (CORS is not a security boundary; backend
# auth relies on the X-API-Key header checked in verify_api_key).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================


class NicheEnum(str, Enum):
    """Predefined niches to prevent malformed queries (spec: 07-Forms-and-Validation.md)"""

    restaurants = "restaurants"
    salons = "salons"
    gyms = "gyms"
    dental_clinics = "dental clinics"
    real_estate = "real estate agents"
    plumbers = "plumbers"
    electricians = "electricians"
    auto_repair = "auto repair"
    pet_stores = "pet stores"
    photography = "photography studios"
    tutoring = "tutoring centers"
    yoga_studios = "yoga studios"
    bakeries = "bakeries"
    laundry = "laundry services"
    car_wash = "car wash"


class ScrapeRequest(BaseModel):
    city: str = Field(..., min_length=1, description="Target city for scraping")
    niche: NicheEnum = Field(..., description="Business niche to search")


class ScrapeResponse(BaseModel):
    status: str
    message: str
    run_id: str | None = None
    scrape_id: str | None = None
    results_count: int = 0


# ============================================================================
# SECURITY / AUTHENTICATION
# ============================================================================


async def verify_api_key(x_api_key: str = Header(None)):
    """Simple API Key verification for backend webhooks."""
    expected_key = getattr(settings, "backend_api_key", "dev-secret-key-123")
    if not x_api_key or x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid API Key")
    return x_api_key


# ============================================================================
# ENDPOINTS
# ============================================================================


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "citypulse-crm-backend"}


@app.get("/api/usage", dependencies=[Depends(verify_api_key)])
async def get_usage():
    """Get daily API usage stats for the admin dashboard."""
    usage = await get_daily_usage()
    return usage


@app.post(
    "/api/scrape", response_model=ScrapeResponse, dependencies=[Depends(verify_api_key)]
)
async def trigger_scrape(request: ScrapeRequest, background_tasks: BackgroundTasks):
    """
    Trigger a full scraping pipeline: Bronze → Silver → Gold.
    Runs in the background via FastAPI without freezing the UI.
    Source: 01-System-Architecture.md
    """
    # Atomically check and increment scraper quota
    await check_and_increment_scraper_quota()

    # Create a run row so the UI can show live job status, then launch the
    # pipeline in the background.
    run_id = await create_run(request.city, request.niche.value)
    background_tasks.add_task(
        _run_full_pipeline,
        city=request.city,
        niche=request.niche.value,
        run_id=run_id,
    )

    return ScrapeResponse(
        status="accepted",
        run_id=run_id,
        message=f"Scraping pipeline started for '{request.niche.value}' in '{request.city}'. "
        f"Track progress in the Active Jobs panel; results appear on the board live.",
    )


async def _run_full_pipeline(city: str, niche: str, run_id: str | None = None):
    """
    Execute the full Medallion pipeline, updating the run row at each stage:
    1. Bronze: Scrape → raw_scrapes
    2. Silver: Clean → cleaned_shops
    3. Gold: Score → crm_leads
    """
    logger.info(f"Pipeline started: {niche} in {city} (run_id: {run_id})")

    try:
        # Step 1: Bronze — Scrape
        await update_run(run_id, status="bronze")
        scrape_result = await scrape_google_maps(city=city, niche=niche)

        if scrape_result.get("status") != "success":
            logger.error(f"Pipeline aborted at Bronze: {scrape_result}")
            await update_run(
                run_id,
                status="failed",
                error=str(scrape_result.get("error", "scrape failed"))[:500],
                finished_at=_now(),
            )
            return

        scrape_id = scrape_result["scrape_id"]
        logger.info(f"Bronze complete: {scrape_result['count']} results")

        # Step 2: Silver — Clean
        await update_run(
            run_id, bronze_count=scrape_result.get("count", 0), status="silver"
        )
        clean_result = await clean_raw_scrape(scrape_id=scrape_id)

        if clean_result.get("status") != "success":
            logger.error(f"Pipeline aborted at Silver: {clean_result}")
            await update_run(
                run_id,
                status="failed",
                error=str(clean_result.get("error", "clean failed"))[:500],
                finished_at=_now(),
            )
            return

        logger.info(
            f"Silver complete: {clean_result['cleaned']} cleaned, {clean_result['blocked']} blocked"
        )

        # Step 3: Gold — Score with AI
        await update_run(
            run_id, silver_count=clean_result.get("cleaned", 0), status="gold"
        )
        score_result = await score_batch_from_scrape(scrape_id=scrape_id)

        logger.info(
            f"Gold complete: {score_result.get('scored', 0)} scored, "
            f"{score_result.get('errors', 0)} errors"
        )

        await update_run(
            run_id,
            gold_count=score_result.get("scored", 0),
            status="done",
            finished_at=_now(),
        )
        logger.info(f"✅ Pipeline complete: {niche} in {city} (run_id: {run_id})")

    except Exception as e:
        logger.error(f"Pipeline crashed (run_id: {run_id}): {e}")
        await update_run(
            run_id, status="failed", error=str(e)[:500], finished_at=_now()
        )


@app.post("/api/score/{place_id}", dependencies=[Depends(verify_api_key)])
async def score_lead(place_id: str):
    """Score a single lead manually."""
    # check_and_increment_gemini_quota is called internally by score_single_lead
    result = await score_single_lead(place_id)
    return result


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
