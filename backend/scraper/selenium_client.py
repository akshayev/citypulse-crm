"""
CityPulse CRM — Selenium Headless Scraper (Fallback)
Source: 04-Tech-Stack.md

Fallback scraper using headless Selenium when SerpApi is unavailable.
Scrapes Google Maps directly via browser automation.
"""
import json
import logging
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from backend.database.supabase_client import get_supabase_client
from backend.database.dlq import push_to_dlq

logger = logging.getLogger(__name__)


def _create_headless_driver() -> webdriver.Chrome:
    """Create a headless Chrome WebDriver instance."""
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=options)


async def scrape_with_selenium(
    city: str,
    niche: str,
    created_by: str | None = None
) -> dict:
    """
    Fallback scraper using Selenium to scrape Google Maps.
    Stores raw results in the Bronze layer.
    """
    driver = None
    try:
        query = f"{niche} in {city}"
        url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"

        logger.info(f"Starting Selenium scrape: '{query}'")

        driver = _create_headless_driver()
        driver.get(url)

        # Wait for results to load
        wait = WebDriverWait(driver, 15)
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "[role='feed']")))

        # Extract business listings
        results = []
        listings = driver.find_elements(By.CSS_SELECTOR, "[role='feed'] > div")

        for listing in listings[:20]:  # Cap at 20 results
            try:
                name_el = listing.find_element(By.CSS_SELECTOR, ".fontHeadlineSmall")
                name = name_el.text if name_el else "Unknown"

                result_item = {
                    "title": name,
                    "scraped_from": "selenium",
                }

                # Try to extract additional data
                try:
                    info_spans = listing.find_elements(By.CSS_SELECTOR, "span")
                    texts = [s.text for s in info_spans if s.text.strip()]
                    result_item["raw_info"] = texts
                except Exception:
                    pass

                results.append(result_item)
            except Exception:
                continue

        if not results:
            logger.warning(f"Selenium: No results found for '{query}'")
            return {"status": "no_results", "query": query, "count": 0}

        # Store in Bronze layer
        raw_data = {
            "local_results": results,
            "search_metadata": {
                "query": query,
                "source": "selenium",
                "total_results": len(results)
            }
        }

        db = get_supabase_client()
        insert_data = {
            "raw_data": raw_data,
            "city": city,
            "niche": niche,
            "source": "selenium"
        }

        if created_by:
            insert_data["created_by"] = created_by

        result = db.table("raw_scrapes").insert(insert_data).execute()
        scrape_id = result.data[0]["id"]

        logger.info(f"Bronze layer (Selenium): Stored {len(results)} results (scrape_id: {scrape_id})")

        return {
            "status": "success",
            "scrape_id": scrape_id,
            "query": query,
            "count": len(results),
            "raw_data": raw_data
        }

    except Exception as e:
        error_msg = f"Selenium scrape failed for '{city}/{niche}': {str(e)}"
        logger.error(error_msg)

        await push_to_dlq(
            task_type="scrape",
            payload={"city": city, "niche": niche, "source": "selenium"},
            error_message=error_msg
        )

        return {"status": "error", "error": error_msg, "dlq": True}

    finally:
        if driver:
            driver.quit()
