"""
CityPulse CRM — SerpApi Google Maps Scraper
Source: 01-System-Architecture.md, 12-Features-Roadmap.md

Scrapes Google Maps for local businesses using SerpApi.
Results are stored as raw JSON in the Bronze layer (raw_scrapes table).
"""
import json
import logging
from serpapi import GoogleSearch
from backend.config import settings
from backend.database.supabase_client import get_supabase_client
from backend.database.dlq import push_to_dlq

logger = logging.getLogger(__name__)


async def scrape_google_maps(
    city: str,
    niche: str,
    created_by: str | None = None
) -> dict:
    """
    Scrape Google Maps for businesses matching city + niche.
    Stores raw JSON in the Bronze layer (raw_scrapes table).

    Returns:
        dict with scrape_id and count of results found.
    """
    try:
        import asyncio
        # Build the SerpApi query
        query = f"{niche} in {city}"

        params = {
            "engine": "google_maps",
            "q": query,
            "type": "search",
            "api_key": settings.serpapi_key,
        }

        logger.info(f"Starting SerpApi scrape: '{query}'")

        # Execute the search asynchronously in a thread
        search = GoogleSearch(params)
        results = await asyncio.to_thread(search.get_dict)

        # Extract local results
        local_results = results.get("local_results", [])

        if not local_results:
            logger.warning(f"No results found for query: '{query}'")
            return {
                "status": "no_results",
                "query": query,
                "count": 0
            }

        # Store raw JSON in Bronze layer
        db = get_supabase_client()
        insert_data = {
            "raw_data": results,
            "city": city,
            "niche": niche,
            "source": "serpapi"
        }

        if created_by:
            insert_data["created_by"] = created_by

        # Execute database insert asynchronously in a thread
        result = await asyncio.to_thread(
            db.table("raw_scrapes").insert(insert_data).execute
        )
        scrape_id = result.data[0]["id"]

        logger.info(f"Bronze layer: Stored {len(local_results)} raw results (scrape_id: {scrape_id})")

        return {
            "status": "success",
            "scrape_id": scrape_id,
            "query": query,
            "count": len(local_results),
            "raw_data": results
        }

    except Exception as e:
        error_msg = f"SerpApi scrape failed for '{city}/{niche}': {str(e)}"
        logger.error(error_msg)

        # Push to Dead Letter Queue — pipeline never crashes on a single failure
        await push_to_dlq(
            task_type="scrape",
            payload={"city": city, "niche": niche, "created_by": created_by},
            error_message=error_msg
        )

        return {
            "status": "error",
            "error": error_msg,
            "dlq": True
        }
