-- ==============================================================================
-- CityPulse CRM — Supabase PostgreSQL Schema
-- Medallion Architecture: Bronze → Silver → Gold
-- Source: 02-Database-Schema.md
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ==============================================================================
-- BRONZE LAYER: Raw Scrapes
-- Stores the initial payload from SerpApi/Selenium as raw JSONB
-- ==============================================================================
CREATE TABLE IF NOT EXISTS raw_scrapes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_data    JSONB NOT NULL,
    city        VARCHAR(255),
    niche       VARCHAR(255),
    source      VARCHAR(50) DEFAULT 'serpapi',  -- 'serpapi' or 'selenium'
    scraped_at  TIMESTAMPTZ DEFAULT NOW(),
    created_by  UUID REFERENCES auth.users(id)
);

-- ==============================================================================
-- SILVER LAYER: Cleaned Shops
-- Filtered, normalized data with DNC cross-check applied
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cleaned_shops (
    place_id    VARCHAR(255) PRIMARY KEY,
    shop_name   VARCHAR(500) NOT NULL,
    phone       VARCHAR(50),
    website     TEXT,
    address     TEXT,
    city        VARCHAR(255),
    niche       VARCHAR(255),
    lat_lng     POINT,
    rating      DECIMAL(2,1),
    review_count INTEGER DEFAULT 0,
    is_active   BOOLEAN DEFAULT TRUE,  -- Soft delete flag (spec: 03-Security)
    raw_scrape_id UUID REFERENCES raw_scrapes(id),
    cleaned_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- GOLD LAYER: CRM Leads (Sales Interface)
-- AI-scored leads with pipeline status for Kanban board
-- ==============================================================================
CREATE TYPE lead_status AS ENUM ('new', 'contacting', 'won', 'lost');

CREATE TABLE IF NOT EXISTS crm_leads (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    place_id    VARCHAR(255) UNIQUE REFERENCES cleaned_shops(place_id) ON DELETE CASCADE,
    heat_score  INTEGER CHECK (heat_score >= 0 AND heat_score <= 100),
    reasoning   TEXT,
    status      lead_status DEFAULT 'new',
    assigned_to UUID REFERENCES auth.users(id),
    pitch_script TEXT,
    column_order INTEGER DEFAULT 0,  -- Sort order within Kanban column
    tags        TEXT[] NOT NULL DEFAULT '{}',  -- D2: free-form labels
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_leads_updated_at
    BEFORE UPDATE ON crm_leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- SYSTEM TABLES: DNC Registry, API Usage, Dead Letter Queue
-- ==============================================================================

-- Do Not Contact Registry (Global Blocklist)
CREATE TABLE IF NOT EXISTS dnc_registry (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone           VARCHAR(50) UNIQUE,
    website_domain  VARCHAR(500) UNIQUE,
    reason          TEXT,
    blocked_at      TIMESTAMPTZ DEFAULT NOW(),
    blocked_by      UUID REFERENCES auth.users(id)
);

-- FinOps: Daily API Usage Tracking (Billing Protection)
CREATE TABLE IF NOT EXISTS daily_api_usage (
    date            DATE PRIMARY KEY DEFAULT CURRENT_DATE,
    gemini_calls    INTEGER DEFAULT 0,
    scraper_runs    INTEGER DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RPC for atomic FinOps Gemini increment and check
CREATE OR REPLACE FUNCTION increment_gemini_calls(max_calls INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_calls INTEGER;
BEGIN
    INSERT INTO daily_api_usage (date, gemini_calls, scraper_runs)
    VALUES (CURRENT_DATE, 1, 0)
    ON CONFLICT (date) DO UPDATE
    SET gemini_calls = daily_api_usage.gemini_calls + 1
    RETURNING gemini_calls INTO current_calls;

    IF current_calls > max_calls THEN
        -- Revert increment if it exceeded quota
        UPDATE daily_api_usage SET gemini_calls = gemini_calls - 1 WHERE date = CURRENT_DATE;
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$;

-- RPC for atomic FinOps Scraper increment and check
CREATE OR REPLACE FUNCTION increment_scraper_runs(max_runs INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_runs INTEGER;
BEGIN
    INSERT INTO daily_api_usage (date, gemini_calls, scraper_runs)
    VALUES (CURRENT_DATE, 0, 1)
    ON CONFLICT (date) DO UPDATE
    SET scraper_runs = daily_api_usage.scraper_runs + 1
    RETURNING scraper_runs INTO current_runs;

    IF current_runs > max_runs THEN
        -- Revert increment if it exceeded quota
        UPDATE daily_api_usage SET scraper_runs = scraper_runs - 1 WHERE date = CURRENT_DATE;
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$;

-- Dead Letter Queue: Failed tasks for retry
CREATE TABLE IF NOT EXISTS dlq_tasks (
    task_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type       VARCHAR(50) NOT NULL,  -- 'scrape', 'clean', 'score'
    payload         JSONB NOT NULL,
    error_message   TEXT,
    retry_count     INTEGER DEFAULT 0,
    max_retries     INTEGER DEFAULT 5,
    next_retry_at   TIMESTAMPTZ,
    status          VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'retrying', 'failed', 'resolved'
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- INDEXES for performance
-- ==============================================================================
CREATE INDEX idx_crm_leads_status ON crm_leads(status);
CREATE INDEX idx_crm_leads_assigned ON crm_leads(assigned_to);
CREATE INDEX idx_crm_leads_heat ON crm_leads(heat_score DESC);
CREATE INDEX idx_crm_leads_tags ON crm_leads USING GIN (tags);
CREATE INDEX idx_cleaned_shops_city ON cleaned_shops(city);
CREATE INDEX idx_cleaned_shops_active ON cleaned_shops(is_active);
CREATE INDEX idx_dlq_status ON dlq_tasks(status);
CREATE INDEX idx_dlq_retry ON dlq_tasks(next_retry_at) WHERE status = 'pending';

-- ==============================================================================
-- PIPELINE RUNS: per-scrape job tracking (live status + observability backbone)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city          VARCHAR(255),
    niche         VARCHAR(255),
    status        VARCHAR(20) NOT NULL DEFAULT 'queued',  -- queued|bronze|silver|gold|done|failed
    bronze_count  INTEGER DEFAULT 0,
    silver_count  INTEGER DEFAULT 0,
    gold_count    INTEGER DEFAULT 0,
    blocked_count INTEGER DEFAULT 0,           -- DNC-blocked at Silver
    dq_failed     INTEGER DEFAULT 0,           -- data-quality rejects at Silver
    gemini_calls  INTEGER DEFAULT 0,
    groq_calls    INTEGER DEFAULT 0,
    llm_cost_usd  NUMERIC(12,6) DEFAULT 0,
    error         TEXT,
    created_by    UUID REFERENCES auth.users(id),
    started_at    TIMESTAMPTZ DEFAULT NOW(),
    finished_at   TIMESTAMPTZ
);
CREATE INDEX idx_pipeline_runs_started ON pipeline_runs(started_at DESC);

-- ==============================================================================
-- LEAD ACTIVITY (D1 — notes & timeline; status changes auto-logged by trigger)
-- ==============================================================================
CREATE TABLE lead_activity (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     uuid NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
    type        text NOT NULL CHECK (type IN ('note', 'status_change', 'pitch', 'assignment')),
    content     text CHECK (content IS NULL OR char_length(content) <= 4000),
    meta        jsonb,
    created_by  uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_activity_lead_id_created_at ON lead_activity (lead_id, created_at DESC);

-- Auto-log status changes (SECURITY DEFINER so the audit row is never suppressed).
CREATE OR REPLACE FUNCTION log_lead_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO lead_activity (lead_id, type, content, meta, created_by)
        VALUES (NEW.id, 'status_change',
                format('Status changed from %s to %s', OLD.status, NEW.status),
                jsonb_build_object('from', OLD.status, 'to', NEW.status), auth.uid());
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_log_lead_status_change
    AFTER UPDATE OF status ON crm_leads
    FOR EACH ROW EXECUTE FUNCTION log_lead_status_change();

-- ==============================================================================
-- SAVED FILTERS (D4 — per-user advanced-search presets)
-- ==============================================================================
CREATE TABLE saved_filters (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
    query       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_saved_filters_user ON saved_filters (user_id, created_at DESC);

-- ==============================================================================
-- merge_lead_tags (F2 — non-clobbering tag union for auto-tagging scrapes)
-- Backend-only: EXECUTE revoked from anon/authenticated, granted to service_role.
-- ==============================================================================
CREATE OR REPLACE FUNCTION merge_lead_tags(p_place_ids text[], p_tags text[])
RETURNS void LANGUAGE sql AS $$
  UPDATE crm_leads
  SET tags = (SELECT array(SELECT DISTINCT unnest(coalesce(tags, '{}') || p_tags)))
  WHERE place_id = ANY(p_place_ids);
$$;
REVOKE ALL ON FUNCTION merge_lead_tags(text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION merge_lead_tags(text[], text[]) TO service_role;

-- ==============================================================================
-- ENABLE REALTIME (Kanban multi-user sync + live job status)
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE crm_leads;
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_runs;
