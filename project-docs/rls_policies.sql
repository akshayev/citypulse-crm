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
-- Trust ONLY app_metadata (server-set), NOT user_metadata (user-editable).
-- Admins are promoted out-of-band via the service role / Admin API.
-- ==============================================================================

-- Helper function to check admin status
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        COALESCE(
            auth.jwt() -> 'app_metadata' ->> 'role',
            ''
        ) = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Default new users to a non-privileged role in app_metadata so the role
-- model is explicit and cannot be self-escalated via user_metadata.
CREATE OR REPLACE FUNCTION set_default_app_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT (COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) ? 'role') THEN
        NEW.raw_app_meta_data =
            COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
            || jsonb_build_object('role', 'sales_rep');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_default_app_role_trigger ON auth.users;
CREATE TRIGGER set_default_app_role_trigger
    BEFORE INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION set_default_app_role();

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

-- ==============================================================================
-- PIPELINE_RUNS: any authenticated user can watch job status; backend (service
-- role) writes; admins full access.
-- ==============================================================================

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_pipeline_runs"
    ON pipeline_runs
    FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "admin_full_access_pipeline_runs"
    ON pipeline_runs
    FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());
