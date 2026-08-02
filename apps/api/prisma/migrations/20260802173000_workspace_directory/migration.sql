-- The session establishes caselog.user_id in a transaction before calling this function.
-- SECURITY DEFINER permits a safe cross-tenant directory lookup without granting the
-- application role unrestricted access to memberships.
CREATE FUNCTION public.list_current_user_workspaces()
RETURNS TABLE (
    organization_id UUID,
    name VARCHAR(120),
    slug VARCHAR(30),
    membership_id UUID,
    role public.membership_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        organization.id,
        organization.name,
        organization.slug,
        membership.id,
        membership.role
    FROM public.memberships AS membership
    JOIN public.organizations AS organization
      ON organization.id = membership.organization_id
    WHERE membership.user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID
      AND membership.deleted_at IS NULL
      AND organization.deleted_at IS NULL
    ORDER BY organization.name, organization.id
$$;

REVOKE ALL ON FUNCTION public.list_current_user_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_current_user_workspaces() TO caselog_app;
