-- D4 — per-user saved filters (advanced search presets).

CREATE TABLE IF NOT EXISTS saved_filters (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
    query       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_filters_user ON saved_filters (user_id, created_at DESC);

-- RLS: a user only ever sees and manages their own filters.
ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_filters_select_own" ON saved_filters;
CREATE POLICY "saved_filters_select_own"
    ON saved_filters FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_filters_insert_own" ON saved_filters;
CREATE POLICY "saved_filters_insert_own"
    ON saved_filters FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_filters_delete_own" ON saved_filters;
CREATE POLICY "saved_filters_delete_own"
    ON saved_filters FOR DELETE TO authenticated
    USING (user_id = auth.uid());
