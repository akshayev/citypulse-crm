"""
CityPulse CRM — SerpApi Google Maps Scraper
Source: 01-System-Architecture.md, 12-Features-Roadmap.md

Scrapes Google Maps for local businesses using SerpApi.
Results are stored as raw JSON in the Bronze layer (raw_scrapes table).
"""

import json
import logging
import asyncio
from typing import List, Dict, Any
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

logger = logging.getLogger(__name__)


async def scrape_google_maps(
    city: str, niche: str, created_by: str | None = None
) -> dict:
    """
    Scrape Google Maps for businesses matching city + niche.
    Primary: SerpApi (Paid/Credits)
    Fallback: Selenium (Free/Headless)
    Stores raw JSON in the Bronze layer (raw_scrapes table).
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
        search = GoogleSearch(params)
        results = await asyncio.to_thread(search.get_dict)
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

        await push_to_dlq(
            task_type="scrape",
            payload={"city": city, "niche": niche, "created_by": created_by},
            error_message=error_msg,
        )

        return {"status": "error", "error": error_msg, "dlq": True}


async def scrape_google_maps_selenium(city: str, niche: str) -> dict:
    """
    Headless Selenium scraper for Google Maps as a cost-saving or API-failure fallback.
    """
    query = f"{niche} in {city}"
    url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"

    logger.info(f"Starting Selenium fallback scrape: {url}")

    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    )

    results = []

    def _run_selenium():
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()), options=options
        )
        try:
            driver.get(url)
            # Wait for search results container
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div[role='feed']"))
            )

            # Simple extraction logic (placeholders for actual class names which vary)
            # In a real SDE scenario, we'd use more robust selectors or a specialized library
            cards = driver.find_elements(
                By.CSS_SELECTOR, "div.Nv2Ybe"
            )  # Common Maps card container
            for card in cards[:10]:  # Limit to 10 for fallback
                try:
                    name = card.find_element(By.CSS_SELECTOR, ".qBF1Pd").text
                    results.append(
                        {
                            "title": name,
                            "address": "Extracted via Selenium",
                            "type": niche,
                            "source": "selenium_fallback",
                        }
                    )
                except:
                    continue

            return results
        finally:
            driver.quit()

    extracted = await asyncio.to_thread(_run_selenium)

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
