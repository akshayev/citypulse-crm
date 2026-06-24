-- ==============================================================================
-- Fix: prevent duplicate crm_leads per place_id
-- ==============================================================================
-- crm_leads had no UNIQUE on place_id, and the scorer did check-then-insert,
-- so concurrent scoring could create duplicate leads for the same business.
-- A UNIQUE constraint provides a hard guarantee and (via its implicit index)
-- also speeds up the place_id FK join used by the Kanban query.
-- ==============================================================================

-- 1) Remove any pre-existing duplicates, keeping the most recently updated row
--    (ctid breaks ties) so the UNIQUE constraint can be added cleanly.
DELETE FROM crm_leads a
USING crm_leads b
WHERE a.place_id = b.place_id
  AND (
        a.updated_at < b.updated_at
        OR (a.updated_at = b.updated_at AND a.ctid < b.ctid)
      );

-- 2) Add the UNIQUE constraint (its index also serves place_id lookups).
ALTER TABLE crm_leads
    ADD CONSTRAINT crm_leads_place_id_unique UNIQUE (place_id);
