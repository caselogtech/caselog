REVOKE ALL ON FUNCTION public.claim_expired_workspace(UUID) FROM caselog_app;
REVOKE ALL ON FUNCTION public.purge_expired_workspace(UUID) FROM caselog_app;
DROP FUNCTION public.claim_expired_workspace(UUID);
DROP FUNCTION public.purge_expired_workspace(UUID);

CREATE FUNCTION public.purge_expired_workspace(
    target_organization_id UUID,
    deleted_before TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    deleted_rows INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('workspace-purge:' || target_organization_id::TEXT, 0)
    );

    DELETE FROM public.organizations
    WHERE id = target_organization_id
      AND deleted_at <= deleted_before
      AND purge_started_at IS NOT NULL;

    GET DIAGNOSTICS deleted_rows = ROW_COUNT;
    RETURN deleted_rows = 1;
END
$$;

REVOKE ALL ON FUNCTION public.purge_expired_workspace(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_workspace(UUID, TIMESTAMPTZ) TO caselog_app;
GRANT UPDATE ON "organizations" TO caselog_app;
