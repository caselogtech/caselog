-- RLS intentionally hides another tenant's redirects. This narrow function lets
-- a workspace reserve slugs globally while still reclaiming one of its own old slugs.
CREATE FUNCTION public.workspace_slug_is_available_for(candidate VARCHAR(30), workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT NOT EXISTS (
        SELECT 1
        FROM public.organizations
        WHERE slug = candidate AND id <> workspace_id
        UNION ALL
        SELECT 1
        FROM public.organization_slug_redirects
        WHERE slug = candidate AND organization_id <> workspace_id
    )
$$;

REVOKE ALL ON FUNCTION public.workspace_slug_is_available_for(VARCHAR, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_slug_is_available_for(VARCHAR, UUID) TO caselog_app;
