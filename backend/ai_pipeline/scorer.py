"""
CityPulse CRM — AI Heat Score Evaluator (Gold Layer)
Source: 01-System-Architecture.md, 11-LLM-Prompt-Architecture.md

Uses Gemini 2.5 Flash (with a free Groq fallback) to read Silver layer data
and assign a Heat Score (0-100) based on digital footprint gaps.
Writes scored leads to crm_leads (Gold layer).
"""

import json
import logging
import asyncio
import httpx
from fastapi import HTTPException
from pydantic import ValidationError
from google import genai
from google.genai import types
from backend.config import settings
from backend.database.supabase_client import get_supabase_client
from backend.database.finops import check_and_increment_gemini_quota
from backend.database.dlq import push_to_dlq
from backend.ai_pipeline.contracts import ScoredLead
from backend.retry import transient_retry

logger = logging.getLogger(__name__)

# Max concurrent LLM scoring calls within a batch (bounds API load / latency).
_SCORE_CONCURRENCY = 5

# Exact system prompt from 11-LLM-Prompt-Architecture.md
HEAT_SCORE_SYSTEM_PROMPT = """You are an expert sales analyst data pipeline. Your job is to evaluate local business data and assign a "Heat Score" from 0 to 100 indicating how likely they are to need web development or digital marketing services.
Scoring Criteria:
- +40 points if the business has NO website.
- +30 points if the website exists but is unresponsive or lacks basic SEO meta tags.
- +20 points if Google Maps reviews are under 4.0.
- +10 points if they have unclaimed Google Business profiles.
Output format MUST be strictly JSON: {"heat_score": 85, "reasoning": "No website found, high review volume indicates active business but poor digital footprint."}"""


def _heat_tier(score: int) -> str:
    """Bucket a heat score into a tier tag (mirrors frontend getHeatScoreClass)."""
    if score >= 70:
        return "hot"
    if score >= 40:
        return "warm"
    return "cold"


def _lead_auto_tags(shop: dict, heat_score: int) -> list[str]:
    """Auto-tags for a scraped lead: niche + city + heat tier (normalised)."""
    tags: list[str] = []
    niche = (shop.get("niche") or "").strip().lower()
    city = (shop.get("city") or "").strip().lower()
    if niche:
        tags.append(niche)
    if city:
        tags.append(city)
    tags.append(_heat_tier(heat_score))
    return tags


def _build_business_context(shop: dict) -> str:
    """Build a context string from Silver layer shop data for Gemini evaluation."""
    parts = [f"Business Name: {shop.get('shop_name', 'Unknown')}"]

    if shop.get("website"):
        parts.append(f"Website: {shop['website']}")
    else:
        parts.append("Website: NONE — No website found")

    if shop.get("phone"):
        parts.append(f"Phone: {shop['phone']}")

    if shop.get("address"):
        parts.append(f"Address: {shop['address']}")

    if shop.get("rating") is not None:
        parts.append(f"Google Rating: {shop['rating']}/5.0")
    else:
        parts.append("Google Rating: Not available")

    parts.append(f"Review Count: {shop.get('review_count', 0)}")
    parts.append(f"City: {shop.get('city', 'Unknown')}")
    parts.append(f"Niche: {shop.get('niche', 'Unknown')}")

    return "\n".join(parts)


def _parse_score_json(response_text: str) -> dict:
    """Parse the model's JSON output into a clamped heat_score + reasoning."""
    response_text = (response_text or "").strip()
    # Handle potential markdown code blocks in the response
    if response_text.startswith("```"):
        response_text = response_text.split("\n", 1)[1]
        response_text = response_text.rsplit("```", 1)[0]
    score_data = json.loads(response_text)
    heat_score = max(0, min(100, int(score_data.get("heat_score", 0))))
    return {"heat_score": heat_score, "reasoning": score_data.get("reasoning", "")}


# Approx LLM pricing (USD per 1M tokens). Groq free tier is treated as $0.
_PRICING = {
    "gemini": {"in": 0.30, "out": 2.50},
    "groq": {"in": 0.0, "out": 0.0},
}


def estimate_cost_usd(usage: dict) -> float:
    """Estimate the USD cost of one LLM call from its token usage."""
    p = _PRICING.get(usage.get("provider", ""), {"in": 0.0, "out": 0.0})
    return round(
        (usage.get("tokens_in", 0) * p["in"] + usage.get("tokens_out", 0) * p["out"])
        / 1_000_000,
        6,
    )


@transient_retry
def _gemini_score_sync(context: str) -> tuple[dict, dict]:
    """Score via Gemini (blocking; call inside a thread). Returns (score, usage)."""
    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=context,
        config=types.GenerateContentConfig(
            system_instruction=HEAT_SCORE_SYSTEM_PROMPT,
            temperature=0.1,  # Low temperature for deterministic scoring
            response_mime_type="application/json",
        ),
    )
    um = getattr(response, "usage_metadata", None)
    usage = {
        "provider": "gemini",
        "tokens_in": getattr(um, "prompt_token_count", 0) or 0,
        "tokens_out": getattr(um, "candidates_token_count", 0) or 0,
    }
    return _parse_score_json(response.text), usage


@transient_retry
def _groq_score_sync(context: str) -> tuple[dict, dict]:
    """Score via Groq's free OpenAI-compatible API (blocking). Returns (score, usage)."""
    resp = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        json={
            "model": settings.groq_model,
            "messages": [
                {"role": "system", "content": HEAT_SCORE_SYSTEM_PROMPT},
                {"role": "user", "content": context},
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    body = resp.json()
    content = body["choices"][0]["message"]["content"]
    u = body.get("usage", {}) or {}
    usage = {
        "provider": "groq",
        "tokens_in": u.get("prompt_tokens", 0) or 0,
        "tokens_out": u.get("completion_tokens", 0) or 0,
    }
    return _parse_score_json(content), usage


async def _llm_heat_score(context: str) -> tuple[dict, dict]:
    """Heat-score `context`, preferring Gemini and falling back to the free Groq tier.

    Returns (score, usage). Falls back to Groq when Gemini errors OR when the
    daily Gemini FinOps cap is reached. Raises if neither provider is available.
    """
    gemini_allowed = True
    try:
        # Reserve a Gemini call against the daily FinOps cap (atomic RPC)
        await check_and_increment_gemini_quota()
    except HTTPException as e:
        if e.status_code == 429:
            gemini_allowed = False  # over cap → try the free fallback instead
        else:
            raise

    if gemini_allowed:
        try:
            return await asyncio.to_thread(_gemini_score_sync, context)
        except Exception as e:
            logger.warning(
                f"Gemini scoring failed ({e}); attempting Groq free-tier fallback."
            )

    if settings.groq_api_key:
        logger.info(
            f"Heat scoring via Groq free-tier fallback (model: {settings.groq_model})."
        )
        return await asyncio.to_thread(_groq_score_sync, context)

    if not gemini_allowed:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily Gemini quota reached ({settings.max_gemini_calls_per_day} calls) "
                "and no GROQ_API_KEY fallback configured."
            ),
        )
    raise RuntimeError(
        "Gemini scoring failed and no GROQ_API_KEY configured for fallback."
    )


async def score_single_lead(
    place_id: str, *, push_to_dlq_on_error: bool = True
) -> dict:
    """
    Score a single Silver layer shop using Gemini 2.5 Flash (Groq fallback).
    Inserts the scored lead into the Gold layer (crm_leads).

    push_to_dlq_on_error: True on the first (pipeline) attempt so failures are
    enqueued for retry. The DLQ worker passes False on retries so it does not
    create duplicate DLQ rows (it owns retry bookkeeping itself).
    """
    db = get_supabase_client()

    try:
        # Fetch the cleaned shop data
        result = await asyncio.to_thread(
            db.table("cleaned_shops").select("*").eq("place_id", place_id).execute
        )

        if not result.data:
            raise ValueError(f"Cleaned shop not found: {place_id}")

        shop = result.data[0]
        context = _build_business_context(shop)

        # Score via Gemini (subject to the FinOps cap), falling back to the
        # free Groq tier when Gemini errors or the daily cap is reached.
        score, usage = await _llm_heat_score(context)
        heat_score = score["heat_score"]
        reasoning = score["reasoning"]

        # Gold DQ gate: validate the scored lead against its write contract
        # (heat_score in 0-100, non-blank reasoning) before persisting. A bad
        # LLM output is treated as a scoring failure (retryable via the DLQ).
        try:
            lead = ScoredLead(
                place_id=place_id, heat_score=heat_score, reasoning=reasoning
            )
        except ValidationError as ve:
            raise ValueError(
                f"Scored lead failed DQ contract: {ve.errors(include_url=False)}"
            )

        # Upsert into Gold layer (crm_leads). on_conflict=place_id makes scoring
        # idempotent (no duplicate leads under concurrency / re-scoring) and only
        # touches the scoring fields — status/assigned_to/column_order are NOT in
        # the payload, so a re-score never resets a lead's Kanban state (a new
        # row falls back to the schema default status='new').
        lead_data = lead.model_dump()

        await asyncio.to_thread(
            db.table("crm_leads").upsert(lead_data, on_conflict="place_id").execute
        )

        # Auto-tag (best-effort) with niche + city + heat tier so the lead is
        # immediately filterable. Non-clobbering union RPC preserves user tags;
        # a tagging failure must not fail an already-scored lead.
        try:
            tags = _lead_auto_tags(shop, heat_score)
            if tags:
                await asyncio.to_thread(
                    db.rpc(
                        "merge_lead_tags",
                        {"p_place_ids": [place_id], "p_tags": tags},
                    ).execute
                )
        except Exception as tag_err:  # noqa: BLE001
            logger.warning(f"Auto-tagging failed for {place_id}: {tag_err}")

        logger.info(
            f"Gold layer: Scored {shop['shop_name']} → Heat Score: {heat_score}"
        )

        return {
            "status": "success",
            "place_id": place_id,
            "shop_name": shop["shop_name"],
            "heat_score": heat_score,
            "reasoning": reasoning,
            "usage": usage,
        }

    except HTTPException as e:
        if e.status_code == 429:
            logger.warning(
                f"Gemini quota exhausted while scoring {place_id}: {e.detail}"
            )
            return {"status": "quota_exceeded", "error": e.detail}
        raise

    except Exception as e:
        error_msg = f"Gemini scoring failed for {place_id}: {str(e)}"
        logger.error(error_msg)

        # Enqueue for retry only on the first attempt; the DLQ worker owns
        # retry bookkeeping and must not re-enqueue (avoids duplicate rows).
        if push_to_dlq_on_error:
            await push_to_dlq(
                task_type="score",
                payload={"place_id": place_id},
                error_message=error_msg,
            )

        return {"status": "error", "error": error_msg, "dlq": push_to_dlq_on_error}


async def score_batch_from_scrape(scrape_id: str) -> dict:
    """
    Score all cleaned shops from a specific scrape.
    This is the final step in the Bronze → Silver → Gold pipeline.
    """
    db = get_supabase_client()

    # Get all cleaned shops linked to this scrape
    result = await asyncio.to_thread(
        db.table("cleaned_shops")
        .select("place_id")
        .eq("raw_scrape_id", scrape_id)
        .eq("is_active", True)
        .execute
    )

    if not result.data:
        return {"status": "no_shops", "scrape_id": scrape_id, "scored": 0}

    place_ids = [s["place_id"] for s in result.data]

    # Batch the "already scored" check — one query instead of N.
    existing = await asyncio.to_thread(
        db.table("crm_leads").select("place_id").in_("place_id", place_ids).execute
    )
    already = {r["place_id"] for r in (existing.data or [])}
    to_score = [pid for pid in place_ids if pid not in already]

    scored = 0
    errors = 0
    quota_exhausted = False
    gemini_calls = 0
    groq_calls = 0
    tokens_in = 0
    tokens_out = 0
    cost_usd = 0.0

    # Score in bounded-concurrency chunks (parallel within a chunk). If the
    # daily quota is hit, stop launching further chunks.
    for i in range(0, len(to_score), _SCORE_CONCURRENCY):
        chunk = to_score[i : i + _SCORE_CONCURRENCY]
        results = await asyncio.gather(
            *(score_single_lead(pid) for pid in chunk), return_exceptions=True
        )
        for res in results:
            if isinstance(res, Exception):
                errors += 1
                continue
            status = res.get("status")
            if status == "success":
                scored += 1
                usage = res.get("usage") or {}
                if usage.get("provider") == "gemini":
                    gemini_calls += 1
                elif usage.get("provider") == "groq":
                    groq_calls += 1
                tokens_in += usage.get("tokens_in", 0)
                tokens_out += usage.get("tokens_out", 0)
                cost_usd += estimate_cost_usd(usage)
            elif status == "quota_exceeded":
                quota_exhausted = True
            else:
                errors += 1
        if quota_exhausted:
            logger.warning(
                "Stopping batch scoring early due to daily Gemini quota exhaustion."
            )
            break

    logger.info(
        f"Gold layer batch: Scored {scored}, Errors: {errors}, "
        f"Cost: ${cost_usd:.4f} (gemini={gemini_calls}, groq={groq_calls}, scrape_id: {scrape_id})"
    )

    return {
        "status": "partial" if quota_exhausted else "success",
        "scrape_id": scrape_id,
        "scored": scored,
        "errors": errors,
        "quota_exhausted": quota_exhausted,
        "gemini_calls": gemini_calls,
        "groq_calls": groq_calls,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "llm_cost_usd": round(cost_usd, 6),
    }
