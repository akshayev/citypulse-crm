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
    place_id    VARCHAR(255) REFERENCES cleaned_shops(place_id) ON DELETE CASCADE,
    heat_score  INTEGER CHECK (heat_score >= 0 AND heat_score <= 100),
    reasoning   TEXT,
    status      lead_status DEFAULT 'new',
    assigned_to UUID REFERENCES auth.users(id),
    pitch_script TEXT,
    column_order INTEGER DEFAULT 0,  -- Sort order within Kanban column
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
CREATE INDEX idx_cleaned_shops_city ON cleaned_shops(city);
CREATE INDEX idx_cleaned_shops_active ON cleaned_shops(is_active);
CREATE INDEX idx_dlq_status ON dlq_tasks(status);
CREATE INDEX idx_dlq_retry ON dlq_tasks(next_retry_at) WHERE status = 'pending';

-- ==============================================================================
-- ENABLE REALTIME for CRM leads table (Kanban multi-user sync)
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE crm_leads;
