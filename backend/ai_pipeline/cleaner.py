"""
CityPulse CRM — Medallion Data Cleaner (Silver Layer)
Source: 01-System-Architecture.md, 12-Features-Roadmap.md

Python logic that:
1. Sanitizes scraped data from Bronze layer
2. Normalizes strings
3. Aggressively filters out DNC (Do Not Contact) leads
4. Inserts safe data into cleaned_shops (Silver layer)
"""

import re
import logging
from backend.database.supabase_client import get_supabase_client
from backend.database.dlq import push_to_dlq

logger = logging.getLogger(__name__)


def _normalize_phone(phone: str | None) -> str | None:
    """Strip special characters and validate 10-digit phone numbers."""
    if not phone:
        return None
    # Remove all non-digit characters
    digits = re.sub(r"\D", "", phone)
    # Handle country codes (strip leading 1 for US/Canada, 91 for India)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    elif len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    # Validate 10-digit length
    if len(digits) == 10:
        return digits
    return phone  # Return original if can't normalize


def _extract_domain(website: str | None) -> str | None:
    """Extract the domain from a full URL."""
    if not website:
        return None
    # Remove protocol and www
    domain = re.sub(r"^https?://", "", website)
    domain = re.sub(r"^www\.", "", domain)
    # Remove path
    domain = domain.split("/")[0]
    return domain.lower().strip()


async def _check_dnc(phone: str | None, website: str | None) -> bool:
    """
    Check if a lead matches any entry in the DNC registry.
    Returns True if the lead should be BLOCKED (is on DNC list).
    Source: 03-Security-and-Compliance.md
    """
    db = get_supabase_client()
    import asyncio

    if phone:
        normalized = _normalize_phone(phone)
        if normalized:
            result = await asyncio.to_thread(
                db.table("dnc_registry").select("id").eq("phone", normalized).execute
            )
            if result.data:
                logger.info(f"DNC BLOCK: Phone {normalized} is on blocklist")
                return True

    if website:
        domain = _extract_domain(website)
        if domain:
            result = await asyncio.to_thread(
                db.table("dnc_registry")
                .select("id")
                .eq("website_domain", domain)
                .execute
            )
            if result.data:
                logger.info(f"DNC BLOCK: Domain {domain} is on blocklist")
                return True

    return False


async def clean_raw_scrape(
    scrape_id: str, *, push_to_dlq_on_error: bool = True
) -> dict:
    """
    Process a Bronze layer raw scrape into Silver layer cleaned_shops.

    1. Fetch raw JSON from raw_scrapes
    2. Extract key fields
    3. Cross-check DNC registry
    4. Insert safe records into cleaned_shops

    push_to_dlq_on_error: True on the first attempt; the DLQ worker passes False
    on retries so it does not create duplicate DLQ rows.
    """
    db = get_supabase_client()
    import asyncio

    try:
        # Fetch the raw scrape
        result = await asyncio.to_thread(
            db.table("raw_scrapes").select("*").eq("id", scrape_id).execute
        )

        if not result.data:
            raise ValueError(f"Raw scrape not found: {scrape_id}")

        raw = result.data[0]
        raw_data = raw["raw_data"]
        city = raw.get("city", "")
        niche = raw.get("niche", "")

        local_results = raw_data.get("local_results", [])
        cleaned_count = 0
        blocked_count = 0
        skipped_count = 0

        for item in local_results:
            try:
                # Extract key fields from SerpApi/Selenium response
                place_id = (
                    item.get("place_id") or item.get("data_id") or item.get("data_cid")
                )

                if not place_id:
                    skipped_count += 1
                    continue

                shop_name = item.get("title", "Unknown Business")
                phone = item.get("phone")
                website = item.get("website") or item.get("link")
                address = item.get("address")
                rating = item.get("rating")
                review_count = item.get("reviews", 0)

                # Extract GPS coordinates
                gps = item.get("gps_coordinates", {})
                lat = gps.get("latitude")
                lng = gps.get("longitude")

                # DNC cross-check (spec: 03-Security)
                is_blocked = await _check_dnc(phone, website)
                if is_blocked:
                    blocked_count += 1
                    continue

                # Normalize phone
                normalized_phone = _normalize_phone(phone)

                # Upsert into Silver layer (cleaned_shops)
                shop_data = {
                    "place_id": str(place_id),
                    "shop_name": shop_name.strip(),
                    "phone": normalized_phone,
                    "website": website,
                    "address": address,
                    "city": city,
                    "niche": niche,
                    "rating": float(rating) if rating else None,
                    "review_count": int(review_count) if review_count else 0,
                    "is_active": True,
                    "raw_scrape_id": scrape_id,
                }

                # Add lat_lng as PostgreSQL POINT if available
                if lat and lng:
                    shop_data["lat_lng"] = f"({lat},{lng})"

                await asyncio.to_thread(
                    db.table("cleaned_shops")
                    .upsert(shop_data, on_conflict="place_id")
                    .execute
                )

                cleaned_count += 1

            except Exception as e:
                logger.warning(f"Failed to clean item: {e}")
                skipped_count += 1
                continue

        logger.info(
            f"Silver layer: Cleaned {cleaned_count}, "
            f"Blocked by DNC: {blocked_count}, "
            f"Skipped: {skipped_count} "
            f"(scrape_id: {scrape_id})"
        )

        return {
            "status": "success",
            "scrape_id": scrape_id,
            "cleaned": cleaned_count,
            "blocked": blocked_count,
            "skipped": skipped_count,
        }

    except Exception as e:
        error_msg = f"Silver cleaning failed for scrape {scrape_id}: {str(e)}"
        logger.error(error_msg)

        if push_to_dlq_on_error:
            await push_to_dlq(
                task_type="clean",
                payload={"scrape_id": scrape_id},
                error_message=error_msg,
            )

        return {"status": "error", "error": error_msg, "dlq": push_to_dlq_on_error}
