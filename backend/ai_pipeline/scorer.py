"""
CityPulse CRM — AI Heat Score Evaluator (Gold Layer)
Source: 01-System-Architecture.md, 11-LLM-Prompt-Architecture.md

Uses Gemini 1.5 Flash to read Silver layer data and assign
a Heat Score (0-100) based on digital footprint gaps.
Writes scored leads to crm_leads (Gold layer).
"""
import json
import logging
import asyncio
import httpx
from fastapi import HTTPException
from google import genai
from google.genai import types
from backend.config import settings
from backend.database.supabase_client import get_supabase_client
from backend.database.finops import check_and_increment_gemini_quota
from backend.database.dlq import push_to_dlq

logger = logging.getLogger(__name__)

# Exact system prompt from 11-LLM-Prompt-Architecture.md
HEAT_SCORE_SYSTEM_PROMPT = """You are an expert sales analyst data pipeline. Your job is to evaluate local business data and assign a "Heat Score" from 0 to 100 indicating how likely they are to need web development or digital marketing services.
Scoring Criteria:
- +40 points if the business has NO website.
- +30 points if the website exists but is unresponsive or lacks basic SEO meta tags.
- +20 points if Google Maps reviews are under 4.0.
- +10 points if they have unclaimed Google Business profiles.
Output format MUST be strictly JSON: {"heat_score": 85, "reasoning": "No website found, high review volume indicates active business but poor digital footprint."}"""


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


def _gemini_score_sync(context: str) -> dict:
    """Score via Gemini (blocking; call inside a thread)."""
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
    return _parse_score_json(response.text)


def _groq_score_sync(context: str) -> dict:
    """Score via Groq's free OpenAI-compatible API (blocking; call inside a thread)."""
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
    content = resp.json()["choices"][0]["message"]["content"]
    return _parse_score_json(content)


async def _llm_heat_score(context: str) -> dict:
    """Heat-score `context`, preferring Gemini and falling back to the free Groq tier.

    Falls back to Groq when Gemini errors OR when the daily Gemini FinOps cap is
    reached. Raises if neither provider is available.
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
            logger.warning(f"Gemini scoring failed ({e}); attempting Groq free-tier fallback.")

    if settings.groq_api_key:
        logger.info(f"Heat scoring via Groq free-tier fallback (model: {settings.groq_model}).")
        return await asyncio.to_thread(_groq_score_sync, context)

    if not gemini_allowed:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily Gemini quota reached ({settings.max_gemini_calls_per_day} calls) "
                "and no GROQ_API_KEY fallback configured."
            ),
        )
    raise RuntimeError("Gemini scoring failed and no GROQ_API_KEY configured for fallback.")


async def score_single_lead(place_id: str) -> dict:
    """
    Score a single Silver layer shop using Gemini 1.5 Flash.
    Inserts the scored lead into the Gold layer (crm_leads).
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
        score = await _llm_heat_score(context)
        heat_score = score["heat_score"]
        reasoning = score["reasoning"]

        # Insert into Gold layer (crm_leads)
        lead_data = {
            "place_id": place_id,
            "heat_score": heat_score,
            "reasoning": reasoning,
            "status": "new",
        }

        await asyncio.to_thread(
            db.table("crm_leads").insert(lead_data).execute
        )

        logger.info(f"Gold layer: Scored {shop['shop_name']} → Heat Score: {heat_score}")

        return {
            "status": "success",
            "place_id": place_id,
            "shop_name": shop["shop_name"],
            "heat_score": heat_score,
            "reasoning": reasoning
        }

    except HTTPException as e:
        if e.status_code == 429:
            logger.warning(f"Gemini quota exhausted while scoring {place_id}: {e.detail}")
            return {"status": "quota_exceeded", "error": e.detail}
        raise

    except Exception as e:
        error_msg = f"Gemini scoring failed for {place_id}: {str(e)}"
        logger.error(error_msg)

        # Push to DLQ — pipeline never crashes
        await push_to_dlq(
            task_type="score",
            payload={"place_id": place_id},
            error_message=error_msg
        )

        return {"status": "error", "error": error_msg, "dlq": True}


async def score_batch_from_scrape(scrape_id: str) -> dict:
    """
    Score all cleaned shops from a specific scrape.
    This is the final step in the Bronze → Silver → Gold pipeline.
    """
    db = get_supabase_client()
    import asyncio

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

    scored = 0
    errors = 0
    quota_exhausted = False

    for shop in result.data:
        # Check if already scored
        existing = await asyncio.to_thread(
            db.table("crm_leads")
            .select("id")
            .eq("place_id", shop["place_id"])
            .execute
        )

        if existing.data:
            logger.info(f"Skipping already-scored lead: {shop['place_id']}")
            continue

        result = await score_single_lead(shop["place_id"])

        if result.get("status") == "success":
            scored += 1
        elif result.get("status") == "quota_exceeded":
            quota_exhausted = True
            logger.warning("Stopping batch scoring early due to daily Gemini quota exhaustion.")
            break
        else:
            errors += 1

    logger.info(f"Gold layer batch: Scored {scored}, Errors: {errors} (scrape_id: {scrape_id})")

    return {
        "status": "partial" if quota_exhausted else "success",
        "scrape_id": scrape_id,
        "scored": scored,
        "errors": errors,
        "quota_exhausted": quota_exhausted
    }
