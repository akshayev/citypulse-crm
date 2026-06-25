-- ==============================================================================
-- Per-run metrics: LLM cost/calls + data-quality counters on pipeline_runs
-- ==============================================================================
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS gemini_calls  INTEGER DEFAULT 0;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS groq_calls    INTEGER DEFAULT 0;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS llm_cost_usd  NUMERIC(12,6) DEFAULT 0;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS dq_failed     INTEGER DEFAULT 0;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS blocked_count INTEGER DEFAULT 0;
