-- D1 — Lead notes & activity timeline.
-- An append-only audit/notes log per lead. Notes are inserted by users from the
-- UI; status changes are auto-logged by a trigger on crm_leads.

CREATE TABLE IF NOT EXISTS lead_activity (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     uuid NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
    type        text NOT NULL CHECK (type IN ('note', 'status_change', 'pitch', 'assignment')),
    content     text,
    meta        jsonb,
    created_by  uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activity_lead_id_created_at
    ON lead_activity (lead_id, created_at DESC);

-- Bound note length server-side (the client textarea caps at 2000; this guards
-- raw API callers). Idempotent for the already-applied table.
DO $$ BEGIN
    ALTER TABLE lead_activity
        ADD CONSTRAINT lead_activity_content_len
        CHECK (content IS NULL OR char_length(content) <= 4000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- RLS — mirror crm_leads visibility (admins see all; reps see assigned/unassigned).
-- ---------------------------------------------------------------------------
ALTER TABLE lead_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_select_visible_leads" ON lead_activity;
CREATE POLICY "activity_select_visible_leads"
    ON lead_activity
    FOR SELECT
    TO authenticated
    USING (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM crm_leads l
            WHERE l.id = lead_activity.lead_id
              AND (l.assigned_to = auth.uid() OR l.assigned_to IS NULL)
        )
    );

DROP POLICY IF EXISTS "activity_insert_visible_leads" ON lead_activity;
CREATE POLICY "activity_insert_visible_leads"
    ON lead_activity
    FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        -- Users may only add notes. System types (status_change/pitch/assignment)
        -- are written by the SECURITY DEFINER trigger or service role, which
        -- bypass RLS — so the timeline can't be forged via the public API.
        AND type = 'note'
        AND (
            is_admin()
            OR EXISTS (
                SELECT 1 FROM crm_leads l
                WHERE l.id = lead_activity.lead_id
                  AND (l.assigned_to = auth.uid() OR l.assigned_to IS NULL)
            )
        )
    );

-- ---------------------------------------------------------------------------
-- Auto-log status changes. SECURITY DEFINER so the audit row is always written
-- regardless of the caller's RLS (the log must not be suppressible).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_lead_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO lead_activity (lead_id, type, content, meta, created_by)
        VALUES (
            NEW.id,
            'status_change',
            format('Status changed from %s to %s', OLD.status, NEW.status),
            jsonb_build_object('from', OLD.status, 'to', NEW.status),
            auth.uid()
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_lead_status_change ON crm_leads;
CREATE TRIGGER trg_log_lead_status_change
    AFTER UPDATE OF status ON crm_leads
    FOR EACH ROW
    EXECUTE FUNCTION log_lead_status_change();
