-- ==============================================================================
-- Pipeline run tracking + live job status
-- ==============================================================================
-- Gives the frontend a real job-status signal (instead of guessing with a
-- setTimeout) and is the backbone for pipeline observability/metrics.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    city          VARCHAR(255),
    niche         VARCHAR(255),
    -- queued → bronze → silver → gold → done | failed
    status        VARCHAR(20) NOT NULL DEFAULT 'queued',
    bronze_count  INTEGER DEFAULT 0,
    silver_count  INTEGER DEFAULT 0,
    gold_count    INTEGER DEFAULT 0,
    error         TEXT,
    created_by    UUID REFERENCES auth.users(id),
    started_at    TIMESTAMPTZ DEFAULT NOW(),
    finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON pipeline_runs(started_at DESC);

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may watch job status; only the service role (backend)
-- writes, and admins get full access.
CREATE POLICY "authenticated_select_pipeline_runs"
    ON pipeline_runs FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "admin_full_access_pipeline_runs"
    ON pipeline_runs FOR ALL TO authenticated
    USING (is_admin()) WITH CHECK (is_admin());

-- Realtime so the "Active Jobs" panel updates live.
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_runs;
