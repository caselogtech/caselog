DROP FUNCTION public.purge_expired_workspace(UUID, TIMESTAMPTZ);

CREATE FUNCTION public.claim_expired_workspace(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('workspace-purge:' || target_organization_id::TEXT, 0)
    );

    UPDATE public.organizations
    SET purge_started_at = COALESCE(purge_started_at, CURRENT_TIMESTAMP)
    WHERE id = target_organization_id
      AND deleted_at IS NOT NULL
      AND deleted_at + INTERVAL '30 days' <= CURRENT_TIMESTAMP;

    RETURN FOUND;
END
$$;

CREATE FUNCTION public.purge_expired_workspace(target_organization_id UUID)
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
      AND deleted_at IS NOT NULL
      AND deleted_at + INTERVAL '30 days' <= CURRENT_TIMESTAMP
      AND purge_started_at IS NOT NULL;

    GET DIAGNOSTICS deleted_rows = ROW_COUNT;
    RETURN deleted_rows = 1;
END
$$;

-- Normal workspace commands may update user-facing fields and soft-delete state,
-- but only the guarded claim function can cross the irreversible purge boundary.
REVOKE UPDATE ON "organizations" FROM caselog_app;
GRANT UPDATE ("name", "slug", "updated_at", "deleted_at") ON "organizations" TO caselog_app;

REVOKE ALL ON FUNCTION public.claim_expired_workspace(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_workspace(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_expired_workspace(UUID) TO caselog_app;
GRANT EXECUTE ON FUNCTION public.purge_expired_workspace(UUID) TO caselog_app;
