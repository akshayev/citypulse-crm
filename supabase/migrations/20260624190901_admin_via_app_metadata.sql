-- ==============================================================================
-- Fix: admin role via app_metadata (not user-editable user_metadata)
-- ==============================================================================
-- SECURITY: is_admin() previously read auth.jwt() -> 'user_metadata' ->> 'role'.
-- user_metadata is writable by the user (supabase.auth.updateUser({ data })),
-- so any signed-up user could set role='admin' and gain full admin RLS access.
-- app_metadata (raw_app_meta_data) can only be set server-side (service role /
-- Admin API), so we move the trust boundary there.
-- ==============================================================================

-- 1) is_admin() now trusts ONLY app_metadata.role
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

-- 2) Default every new user to a non-privileged role in app_metadata, so the
--    role model is explicit and cannot be self-escalated. Admins are promoted
--    out-of-band by setting app_metadata.role = 'admin' via the service role.
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

-- ------------------------------------------------------------------------------
-- To create / promote an admin (run server-side with the service role):
--   1. Create the user (Dashboard → Authentication, or Admin API).
--   2. Set app_metadata.role:
--      supabase.auth.admin.updateUserById(<uuid>, { app_metadata: { role: 'admin' } })
--   The user must re-login (or refresh the token) for the claim to take effect.
-- ------------------------------------------------------------------------------
