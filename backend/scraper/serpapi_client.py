"""
CityPulse CRM — SerpApi Google Maps Scraper
Source: 01-System-Architecture.md, 12-Features-Roadmap.md

Scrapes Google Maps for local businesses. SerpApi is the SUPPORTED/primary
path; the headless Selenium fallback is best-effort only (see notes on
scrape_google_maps_selenium). Results are stored as raw JSON in the Bronze
layer (raw_scrapes table).
"""

import hashlib
import logging
import asyncio
from serpapi import GoogleSearch
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from backend.config import settings
from backend.database.supabase_client import get_supabase_client
from backend.database.dlq import push_to_dlq
from backend.retry import transient_retry

logger = logging.getLogger(__name__)


@transient_retry
def _serpapi_search(params: dict) -> dict:
    """SerpApi call with transient-error retries (call inside a thread)."""
    return GoogleSearch(params).get_dict()


async def scrape_google_maps(
    city: str,
    niche: str,
    created_by: str | None = None,
    *,
    push_to_dlq_on_error: bool = True,
) -> dict:
    """
    Scrape Google Maps for businesses matching city + niche.
    Primary: SerpApi (Paid/Credits)
    Fallback: Selenium (Free/Headless)
    Stores raw JSON in the Bronze layer (raw_scrapes table).

    push_to_dlq_on_error: True on the first attempt; the DLQ worker passes False
    on retries so it does not create duplicate DLQ rows.
    """
    query = f"{niche} in {city}"

    try:
        # --- PRIMARY: SerpApi ---
        params = {
            "engine": "google_maps",
            "q": query,
            "type": "search",
            "api_key": settings.serpapi_key,
        }

        logger.info(f"Starting SerpApi scrape: '{query}'")
        results = await asyncio.to_thread(_serpapi_search, params)
        local_results = results.get("local_results", [])

        if local_results:
            return await _store_and_return(results, city, niche, created_by, "serpapi")

        logger.warning(
            f"SerpApi returned no results for '{query}'. Attempting Selenium fallback..."
        )

    except Exception as e:
        logger.error(f"SerpApi failed: {str(e)}. Falling back to Selenium...")

    # --- FALLBACK: Selenium ---
    try:
        selenium_results = await scrape_google_maps_selenium(city, niche)
        if selenium_results.get("count", 0) > 0:
            return await _store_and_return(
                selenium_results["raw_data"],
                city,
                niche,
                created_by,
                "selenium_fallback",
            )

        return {"status": "no_results", "query": query, "count": 0}

    except Exception as e:
        error_msg = f"Scraping failed (both SerpApi and Selenium) for '{city}/{niche}': {str(e)}"
        logger.error(error_msg)

        if push_to_dlq_on_error:
            await push_to_dlq(
                task_type="scrape",
                payload={"city": city, "niche": niche, "created_by": created_by},
                error_message=error_msg,
            )

        return {"status": "error", "error": error_msg, "dlq": push_to_dlq_on_error}


def _synthetic_place_id(name: str, locality: str) -> str:
    """
    Stable synthetic id for Selenium-scraped businesses.

    Google Maps does not reliably expose a stable place_id in the results feed,
    and the Silver layer drops rows without a place_id. A deterministic hash of
    (name, locality) lets these rows flow through Silver/Gold and makes
    re-scraping the same business idempotent (it upserts the same row).
    """
    digest = hashlib.sha1(
        f"{name}|{locality}".strip().lower().encode("utf-8")
    ).hexdigest()
    return f"sel_{digest[:24]}"


async def scrape_google_maps_selenium(city: str, niche: str) -> dict:
    """
    Best-effort headless Selenium fallback for Google Maps.

    IMPORTANT — this is a brittle, best-effort fallback, not a supported path:
    - Google Maps' DOM/class names change often, so extraction may yield nothing.
      When it does, we return count=0 and the caller reports no_results; we never
      store a misleading "success" Bronze row with zero usable businesses.
    - It needs a real Chrome/Chromedriver and will NOT run on serverless web
      hosts (Vercel/Render web services). SerpApi is the supported scraper.
    """
    query = f"{niche} in {city}"
    url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"

    logger.info(f"Starting best-effort Selenium fallback scrape: {url}")

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    def _run_selenium():
        results = []
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()), options=options
        )
        try:
            driver.get(url)
            WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "[role='feed']"))
            )

            # Result cards are the children of the results feed. The listing
            # link's aria-label carries the business name and is more stable
            # than the frequently-rotated CSS class names.
            cards = driver.find_elements(By.CSS_SELECTOR, "[role='feed'] > div")
            for card in cards[:20]:
                try:
                    link = card.find_element(By.CSS_SELECTOR, "a[href*='/maps/place/']")
                    name = (link.get_attribute("aria-label") or "").strip()
                    if not name:
                        continue

                    # Best-effort address (may be absent); never fabricate it.
                    address = None
                    spans = [
                        s.text.strip()
                        for s in card.find_elements(By.CSS_SELECTOR, "span")
                        if s.text.strip()
                    ]
                    if spans:
                        address = spans[-1]

                    results.append(
                        {
                            "place_id": _synthetic_place_id(name, city),
                            "title": name,
                            "address": address,
                            "type": niche,
                            "source": "selenium_fallback",
                        }
                    )
                except Exception:
                    continue
            return results
        finally:
            driver.quit()

    extracted = await asyncio.to_thread(_run_selenium)

    if not extracted:
        logger.warning(
            f"Selenium fallback extracted no usable results for '{query}'; "
            "returning no_results instead of an empty 'success'."
        )

    return {
        "count": len(extracted),
        "raw_data": {"local_results": extracted, "source": "selenium_fallback"},
    }


async def _store_and_return(
    raw_data: dict, city: str, niche: str, created_by: str | None, source: str
) -> dict:
    """Helper to store raw results in Bronze layer."""
    db = get_supabase_client()
    local_results = raw_data.get("local_results", [])

    insert_data = {"raw_data": raw_data, "city": city, "niche": niche, "source": source}
    if created_by:
        insert_data["created_by"] = created_by

    result = await asyncio.to_thread(
        db.table("raw_scrapes").insert(insert_data).execute
    )
    scrape_id = result.data[0]["id"]

    logger.info(
        f"Bronze layer: Stored {len(local_results)} raw results via {source} (scrape_id: {scrape_id})"
    )

    return {
        "status": "success",
        "scrape_id": scrape_id,
        "query": f"{niche} in {city}",
        "count": len(local_results),
        "raw_data": raw_data,
    }
