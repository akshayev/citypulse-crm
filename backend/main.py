"""
CityPulse CRM — FastAPI Backend Server
Source: 01-System-Architecture.md, 12-Features-Roadmap.md

The Orchestrator: FastAPI webhooks that securely trigger background
Selenium/SerpApi scrapes based on frontend payloads.
Runs the full Bronze → Silver → Gold pipeline.
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field
from enum import Enum
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import sentry_sdk

from backend.config import settings
from backend.observability import init_sentry, configure_logging
from backend.database.supabase_client import get_supabase_client
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
from backend.database.metrics import get_pipeline_metrics, get_dlq_status
from fastapi import Header, Depends

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# Reliability controls for the in-process pipeline.
_PIPELINE_CONCURRENCY = 3  # max simultaneous full pipelines
_PIPELINE_SEMAPHORE = asyncio.Semaphore(_PIPELINE_CONCURRENCY)
_active_runs: set[str] = set()  # run_ids currently executing (for graceful shutdown)
_SCRAPE_TIMEOUT = 180  # seconds
_CLEAN_TIMEOUT = 180
_SCORE_TIMEOUT = 900  # batch scoring can be large (parallel chunks)

# Max input length for free-text fields (niche is already enum-bounded).
_MAX_CITY_LENGTH = 120

# Liveness signal for the DLQ worker — refreshed each loop; read by the
# readiness probe to detect a stalled or crashed worker (monotonic clock).
_dlq_last_beat: float | None = None

# Rate limiting (slowapi). Limits are read from settings at request time via
# callables so they can be tuned per environment (and overridden in tests).
#
# Scope note: this backend is called server-to-server by the Next.js proxy
# (with X-API-Key), so get_remote_address sees a single upstream egress IP.
# These limits are therefore a GLOBAL best-effort burst cap across all users
# (in-memory, per-process) — not a per-end-user throttle. That is intentional
# for a single-tenant showcase: it shields the shared SerpApi/LLM budget from
# bursts without a Redis/distributed store. X-Forwarded-For is deliberately NOT
# trusted (it would be trivially spoofable); the durable budget guards are the
# daily FinOps quotas (which are themselves global daily caps).
limiter = Limiter(key_func=get_remote_address)


def _scrape_rate_limit() -> str:
    return settings.scrape_rate_limit


def _score_rate_limit() -> str:
    return settings.score_rate_limit


# ============================================================================
# LIFESPAN: Background DLQ retry worker
# ============================================================================


async def dlq_retry_worker():
    """Background worker that retries failed DLQ tasks with exponential backoff."""
    global _dlq_last_beat
    while True:
        # Heartbeat each loop AND before each task so a busy worker grinding a
        # large backlog still signals liveness; the readiness probe only trips
        # 'not_ready' if a single task hangs (or the worker crashes) past the
        # staleness window — not merely because an iteration takes a while.
        _dlq_last_beat = time.monotonic()
        try:
            pending = await get_pending_retries()
            for task in pending:
                _dlq_last_beat = time.monotonic()
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
    global _dlq_last_beat
    # Observability: enable Sentry + JSON logging if configured (both no-op
    # otherwise).
    configure_logging()
    init_sentry()
    # Seed the heartbeat so readiness is healthy immediately at startup, before
    # the worker's first loop iteration runs.
    _dlq_last_beat = time.monotonic()
    task = asyncio.create_task(dlq_retry_worker())
    logger.info("🚀 CityPulse Backend started. DLQ worker running.")
    yield
    task.cancel()
    # Graceful shutdown: mark any in-flight runs as interrupted so the UI does
    # not show them stuck forever (best-effort).
    for rid in list(_active_runs):
        try:
            await update_run(
                rid,
                status="failed",
                error="Backend restarted; run interrupted.",
                finished_at=_now(),
            )
        except Exception:
            pass
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

# Rate limiting: register the limiter and the 429 handler so the per-route
# @limiter.limit(...) decorators take effect (slowapi reads app.state.limiter).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


async def limit_body_size(request: Request, call_next):
    """Best-effort guard that sheds oversized request bodies with 413.

    Inspects Content-Length only, so it does NOT cover chunked/streaming bodies
    that omit the header — acceptable here because our only caller is the JSON
    proxy, which always sends a Content-Length (and Pydantic max_length bounds
    the parsed size regardless). It still runs before routing/auth so honestly
    oversized payloads are rejected before allocating memory or burning quota.
    """
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > settings.max_request_bytes:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request body too large"},
                )
        except ValueError:
            pass  # malformed header — let downstream parsing reject it
    return await call_next(request)


# Registered BEFORE CORS so CORS ends up the OUTERMOST middleware (Starlette
# runs the last-added middleware first). This way even a short-circuited 413
# response still flows back through CORS and carries the right headers.
app.add_middleware(BaseHTTPMiddleware, dispatch=limit_body_size)

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
    city: str = Field(
        ...,
        min_length=1,
        max_length=_MAX_CITY_LENGTH,
        description="Target city for scraping",
    )
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
    """Liveness probe — process is up and serving (no external dependencies)."""
    return {"status": "healthy", "service": "citypulse-crm-backend"}


async def _db_ping() -> None:
    """Cheap round-trip to confirm the database is reachable."""
    db = get_supabase_client()
    await asyncio.to_thread(db.table("pipeline_runs").select("id").limit(1).execute)


@app.get("/api/health/ready")
async def readiness_check():
    """Readiness probe — only 'ready' when dependencies are healthy.

    Checks DB reachability and that the DLQ worker has beaten recently. Returns
    503 (so orchestrators stop routing traffic) when any check fails.
    """
    checks = {"db": False, "dlq_worker": False}

    try:
        await _db_ping()
        checks["db"] = True
    except Exception as e:  # noqa: BLE001 — readiness must never raise
        logger.warning(f"Readiness DB check failed: {e}")

    if _dlq_last_beat is not None:
        age = time.monotonic() - _dlq_last_beat
        checks["dlq_worker"] = age < settings.dlq_heartbeat_max_age_seconds

    ready = all(checks.values())
    return JSONResponse(
        status_code=200 if ready else 503,
        content={"status": "ready" if ready else "not_ready", "checks": checks},
    )


@app.get("/api/usage", dependencies=[Depends(verify_api_key)])
async def get_usage():
    """Get daily API usage stats for the admin dashboard."""
    usage = await get_daily_usage()
    return usage


@app.get("/api/metrics", dependencies=[Depends(verify_api_key)])
async def get_metrics(days: int = 30):
    """Pipeline observability: funnel, cost, provider split over a window."""
    return await get_pipeline_metrics(days=days)


@app.get("/api/dlq/status", dependencies=[Depends(verify_api_key)])
async def dlq_status():
    """Dead-letter queue health: counts by status + oldest pending."""
    return await get_dlq_status()


@app.post(
    "/api/scrape", response_model=ScrapeResponse, dependencies=[Depends(verify_api_key)]
)
@limiter.limit(_scrape_rate_limit)
async def trigger_scrape(
    request: Request, body: ScrapeRequest, background_tasks: BackgroundTasks
):
    """
    Trigger a full scraping pipeline: Bronze → Silver → Gold.
    Runs in the background via FastAPI without freezing the UI.
    Source: 01-System-Architecture.md

    (slowapi requires the `request: Request` parameter to key the rate limit.)
    """
    # Atomically check and increment scraper quota
    await check_and_increment_scraper_quota()

    # Create a run row so the UI can show live job status, then launch the
    # pipeline in the background.
    run_id = await create_run(body.city, body.niche.value)
    background_tasks.add_task(
        _run_full_pipeline,
        city=body.city,
        niche=body.niche.value,
        run_id=run_id,
    )

    return ScrapeResponse(
        status="accepted",
        run_id=run_id,
        message=f"Scraping pipeline started for '{body.niche.value}' in '{body.city}'. "
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

    # Bound concurrent pipelines; register the run for graceful-shutdown handling.
    await _PIPELINE_SEMAPHORE.acquire()
    if run_id:
        _active_runs.add(run_id)
    try:
        # Step 1: Bronze — Scrape
        await update_run(run_id, status="bronze")
        scrape_result = await asyncio.wait_for(
            scrape_google_maps(city=city, niche=niche), timeout=_SCRAPE_TIMEOUT
        )

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
        clean_result = await asyncio.wait_for(
            clean_raw_scrape(scrape_id=scrape_id), timeout=_CLEAN_TIMEOUT
        )
        clean_result = clean_result or {}

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
            run_id,
            silver_count=clean_result.get("cleaned", 0),
            blocked_count=clean_result.get("blocked", 0),
            dq_failed=clean_result.get("dq_failed", 0),
            status="gold",
        )
        score_result = await asyncio.wait_for(
            score_batch_from_scrape(scrape_id=scrape_id), timeout=_SCORE_TIMEOUT
        )

        logger.info(
            f"Gold complete: {score_result.get('scored', 0)} scored, "
            f"{score_result.get('errors', 0)} errors"
        )

        await update_run(
            run_id,
            gold_count=score_result.get("scored", 0),
            gemini_calls=score_result.get("gemini_calls", 0),
            groq_calls=score_result.get("groq_calls", 0),
            llm_cost_usd=score_result.get("llm_cost_usd", 0),
            status="done",
            finished_at=_now(),
        )
        logger.info(f"✅ Pipeline complete: {niche} in {city} (run_id: {run_id})")

    except Exception as e:
        logger.error(f"Pipeline crashed (run_id: {run_id}): {e}")
        # Report to Sentry (no-op if unconfigured) with run context so the
        # failing pipeline is distinguishable from request-path errors.
        with sentry_sdk.new_scope() as scope:
            scope.set_tag("component", "pipeline")
            scope.set_tag("run_id", run_id or "unknown")
            sentry_sdk.capture_exception(e)
        await update_run(
            run_id, status="failed", error=str(e)[:500], finished_at=_now()
        )
    finally:
        if run_id:
            _active_runs.discard(run_id)
        _PIPELINE_SEMAPHORE.release()


@app.post("/api/score/{place_id}", dependencies=[Depends(verify_api_key)])
@limiter.limit(_score_rate_limit)
async def score_lead(request: Request, place_id: str):
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
