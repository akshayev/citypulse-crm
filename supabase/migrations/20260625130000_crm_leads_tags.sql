-- D2 — free-form tags on leads (bulk-taggable). Array column keeps it simple;
-- existing crm_leads RLS already governs who can update a lead.
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_crm_leads_tags ON crm_leads USING GIN (tags);
