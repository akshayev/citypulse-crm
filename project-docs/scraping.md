# Scraping Architecture

## Overview
Scraping is the first step in the CityPulse CRM Medallion data pipeline. It is responsible for gathering raw data about local businesses from Google Maps and storing it in the **Bronze layer**.

The scraping process is triggered via the `/api/scrape` endpoint (e.g., by an admin searching for "restaurants in Kochi"). The raw JSON data extracted from the source is captured verbatim and serves as an immutable audit record.

## Primary Scraper: SerpApi
The **supported and primary** scraping path utilizes **SerpApi**.
- It uses the `google_maps` engine to search for the requested query (`{niche} in {city}`).
- Requires a valid API key (`SERPAPI_KEY`).
- SerpApi is called with transient-error retries.

## Fallback Scraper: Selenium
In the event that SerpApi fails or returns no results, the system employs a **best-effort headless Selenium fallback**.
- **Limitations:** This is a brittle fallback. Google Maps' DOM changes frequently, which might break the extraction logic. It requires a real Chrome/Chromedriver and will **not** run on serverless web hosts (like Vercel or Render web services).
- **Synthetic Place IDs:** Google Maps does not reliably expose a stable `place_id` in the results feed. For Selenium-scraped businesses, the system generates a stable, deterministic synthetic ID by hashing the business name and locality (e.g., `sel_{hash}`). This allows rows to flow correctly through the Silver and Gold layers and makes re-scraping idempotent (upserting the same row).

## Data Storage (Bronze Layer)
The raw results are stored in the `raw_scrapes` table in PostgreSQL (via Supabase).

```sql
CREATE TABLE IF NOT EXISTS raw_scrapes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_data    JSONB NOT NULL,
    city        VARCHAR(255),
    niche       VARCHAR(255),
    source      VARCHAR(50) DEFAULT 'serpapi',  -- 'serpapi' or 'selenium_fallback'
    scraped_at  TIMESTAMPTZ DEFAULT NOW(),
    created_by  UUID REFERENCES auth.users(id)
);
```

## FinOps and Reliability
- **FinOps Quotas:** Scraping is subject to daily limits (e.g., `MAX_SCRAPER_RUNS_PER_DAY`, default 20) managed via atomic Postgres RPCs (`increment_scraper_runs()`).
- **Rate Limiting:** The `/api/scrape` endpoint is rate-limited (e.g., `10/minute`).
- **Dead Letter Queue (DLQ):** Failed scrape tasks are pushed to a `dlq_tasks` queue and retried by a background worker with exponential backoff.
- **Concurrency & Timeouts:** Bounded to 3 simultaneous pipelines with a per-stage timeout (scrape stage: 180s).
