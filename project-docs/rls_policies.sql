-- ==============================================================================
-- CityPulse CRM — Row Level Security Policies
-- Source: 03-Security-and-Compliance.md
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE raw_scrapes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaned_shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE dnc_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlq_tasks ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- ADMIN BYPASS: Users with role = 'admin' have full access
-- Applied via custom JWT claim: auth.jwt() -> 'user_metadata' ->> 'role'
-- ==============================================================================

-- Helper function to check admin status
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        COALESCE(
            auth.jwt() -> 'user_metadata' ->> 'role',
            ''
        ) = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- CRM_LEADS: Core Kanban table
-- Sales reps: SELECT + UPDATE only their assigned leads
-- Admins: Full CRUD (bypass RLS)
-- ==============================================================================

-- Admins can do everything
CREATE POLICY "admin_full_access_crm_leads"
    ON crm_leads
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Sales reps can view their assigned leads AND unassigned leads
CREATE POLICY "sales_select_assigned_leads"
    ON crm_leads
    FOR SELECT
    TO authenticated
    USING (assigned_to = auth.uid() OR assigned_to IS NULL);

-- Sales reps can update their assigned leads (move cards, add pitch scripts), AND claim unassigned leads
CREATE POLICY "sales_update_assigned_leads"
    ON crm_leads
    FOR UPDATE
    TO authenticated
    USING (assigned_to = auth.uid() OR assigned_to IS NULL)
    WITH CHECK (assigned_to = auth.uid());

-- ==============================================================================
-- RAW_SCRAPES: Only admins can insert/view raw scrape data
-- ==============================================================================

CREATE POLICY "admin_full_access_raw_scrapes"
    ON raw_scrapes
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- ==============================================================================
-- CLEANED_SHOPS: Admins full access, sales reps read-only
-- ==============================================================================

CREATE POLICY "admin_full_access_cleaned_shops"
    ON cleaned_shops
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "sales_select_cleaned_shops"
    ON cleaned_shops
    FOR SELECT
    TO authenticated
    USING (TRUE);  -- All authenticated users can view shops

-- ==============================================================================
-- DNC_REGISTRY: All authenticated users can read, only admins insert/delete
-- ==============================================================================

CREATE POLICY "admin_full_access_dnc"
    ON dnc_registry
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

CREATE POLICY "authenticated_select_dnc"
    ON dnc_registry
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- Sales reps can insert into DNC (when rejecting a lead)
CREATE POLICY "sales_insert_dnc"
    ON dnc_registry
    FOR INSERT
    TO authenticated
    WITH CHECK (TRUE);

-- ==============================================================================
-- DAILY_API_USAGE: Read for all authenticated, write for service role only
-- ==============================================================================

CREATE POLICY "authenticated_select_api_usage"
    ON daily_api_usage
    FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "admin_manage_api_usage"
    ON daily_api_usage
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- ==============================================================================
-- DLQ_TASKS: Admin only
-- ==============================================================================

CREATE POLICY "admin_full_access_dlq"
    ON dlq_tasks
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
