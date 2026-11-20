CREATE FUNCTION public.staff_user_details(target_user_id UUID)
RETURNS TABLE (
    id UUID, email CITEXT, display_name VARCHAR(120), email_verified BOOLEAN,
    active_workspace_count BIGINT, billing_account_count BIGINT,
    created_at TIMESTAMPTZ(3), deleted_at TIMESTAMPTZ(3)
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    PERFORM caselog.require_staff_role('admin');
    RETURN QUERY SELECT
        identity.id, identity.email, identity.display_name,
        identity.email_verified_at IS NOT NULL,
        (SELECT COUNT(*) FROM public.memberships AS membership
          WHERE membership.user_id = identity.id AND membership.deleted_at IS NULL),
        (SELECT COUNT(*) FROM public.billing_account_memberships AS membership
          WHERE membership.user_id = identity.id AND membership.deleted_at IS NULL),
        identity.created_at, identity.deleted_at
    FROM public.users AS identity WHERE identity.id = target_user_id;
END
$$;

CREATE FUNCTION public.staff_user_workspaces(target_user_id UUID, after_id UUID, result_limit INTEGER)
RETURNS TABLE (
    id UUID, name VARCHAR(120), slug VARCHAR(30), role TEXT, deleted_at TIMESTAMPTZ(3)
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    PERFORM caselog.require_staff_role('admin');
    RETURN QUERY SELECT workspace.id, workspace.name, workspace.slug,
        membership.role::TEXT, workspace.deleted_at
    FROM public.memberships AS membership
    JOIN public.organizations AS workspace ON workspace.id = membership.organization_id
    WHERE membership.organization_id = workspace.id
      AND membership.user_id = target_user_id AND membership.deleted_at IS NULL
      AND (after_id IS NULL OR workspace.id > after_id)
    ORDER BY workspace.id
    LIMIT LEAST(GREATEST(result_limit, 1), 101);
END
$$;

REVOKE ALL ON FUNCTION public.staff_user_details(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_user_workspaces(UUID, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_user_details(UUID) TO caselog_app;
GRANT EXECUTE ON FUNCTION public.staff_user_workspaces(UUID, UUID, INTEGER) TO caselog_app;
