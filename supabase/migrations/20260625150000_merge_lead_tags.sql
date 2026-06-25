-- F2 — non-clobbering tag union, used to auto-tag scraped leads with
-- niche + city + heat tier without wiping user-added tags.
--
-- SECURITY INVOKER (default): callable only by the backend service role (which
-- bypasses RLS). EXECUTE is revoked from anon/authenticated so it can't be
-- invoked via PostgREST to rewrite tags on leads a user couldn't otherwise edit.

CREATE OR REPLACE FUNCTION merge_lead_tags(p_place_ids text[], p_tags text[])
RETURNS void
LANGUAGE sql
AS $$
  UPDATE crm_leads
  SET tags = (SELECT array(SELECT DISTINCT unnest(coalesce(tags, '{}') || p_tags)))
  WHERE place_id = ANY(p_place_ids);
$$;

REVOKE ALL ON FUNCTION merge_lead_tags(text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION merge_lead_tags(text[], text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION merge_lead_tags(text[], text[]) TO service_role;
