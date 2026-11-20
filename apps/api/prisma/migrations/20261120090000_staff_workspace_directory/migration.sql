-- Bounded staff projections; existing functions remain available to older artifacts.
CREATE FUNCTION public.list_staff_workspace_customers(
    after_id UUID, result_limit INTEGER, search_query TEXT,
    workspace_state TEXT DEFAULT 'all', target_workspace_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID, name VARCHAR(120), slug VARCHAR(30),
    billing_account_id UUID, billing_account_name VARCHAR(120),
    member_count BIGINT, project_count BIGINT, storage_bytes NUMERIC,
    created_at TIMESTAMPTZ(3), deleted_at TIMESTAMPTZ(3),
    owner_user_id UUID, owner_email CITEXT, owner_display_name VARCHAR(120)
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    PERFORM caselog.require_staff_role('admin');
    IF workspace_state IS NULL OR workspace_state NOT IN ('all', 'current', 'deleted') THEN
        RAISE EXCEPTION 'Invalid workspace state' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT
        workspace.id, workspace.name, workspace.slug, account.id, account.name,
        (SELECT COUNT(*) FROM public.memberships AS membership
          WHERE membership.organization_id = workspace.id AND membership.deleted_at IS NULL),
        (SELECT COUNT(*) FROM public.projects AS project
          WHERE project.organization_id = workspace.id AND project.deleted_at IS NULL),
        COALESCE(usage.storage_bytes_used, 0)::NUMERIC,
        workspace.created_at, workspace.deleted_at,
        contact.id, contact.email, contact.display_name
    FROM public.organizations AS workspace
    LEFT JOIN public.billing_accounts AS account ON account.id = workspace.billing_account_id
    LEFT JOIN public.usage_counters AS usage ON usage.organization_id = workspace.id
    LEFT JOIN LATERAL (
        SELECT identity.id, identity.email, identity.display_name
        FROM public.memberships AS membership
        JOIN public.users AS identity ON identity.id = membership.user_id AND identity.deleted_at IS NULL
        WHERE membership.organization_id = workspace.id AND membership.role = 'owner'
          AND membership.deleted_at IS NULL
        ORDER BY membership.id LIMIT 1
    ) AS contact ON TRUE
    WHERE (after_id IS NULL OR workspace.id > after_id)
      AND (target_workspace_id IS NULL OR workspace.id = target_workspace_id)
      AND (workspace_state = 'all'
        OR (workspace_state = 'current' AND workspace.deleted_at IS NULL)
        OR (workspace_state = 'deleted' AND workspace.deleted_at IS NOT NULL))
      AND (search_query IS NULL
        OR workspace.name ILIKE '%' || search_query || '%'
        OR workspace.slug ILIKE '%' || search_query || '%'
        OR contact.email::TEXT ILIKE '%' || search_query || '%')
    ORDER BY workspace.id
    LIMIT LEAST(GREATEST(result_limit, 1), 101);
END
$$;

CREATE FUNCTION public.staff_workspace_usage(workspace_id UUID)
RETURNS TABLE (
    test_case_count BIGINT, test_run_count BIGINT, open_test_run_count BIGINT,
    ingestion_count BIGINT, pending_upload_count BIGINT, pending_storage_bytes NUMERIC,
    observed_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    PERFORM caselog.require_staff_role('admin');
    RETURN QUERY SELECT
        (SELECT COUNT(*) FROM public.test_cases AS test_case
          JOIN public.projects AS project ON project.organization_id = test_case.organization_id AND project.id = test_case.project_id
          WHERE test_case.organization_id = workspace.id AND test_case.deleted_at IS NULL AND project.deleted_at IS NULL),
        (SELECT COUNT(*) FROM public.test_runs AS test_run
          JOIN public.projects AS project ON project.organization_id = test_run.organization_id AND project.id = test_run.project_id
          WHERE test_run.organization_id = workspace.id AND test_run.deleted_at IS NULL AND project.deleted_at IS NULL),
        (SELECT COUNT(*) FROM public.test_runs AS test_run
          JOIN public.projects AS project ON project.organization_id = test_run.organization_id AND project.id = test_run.project_id
          WHERE test_run.organization_id = workspace.id AND test_run.deleted_at IS NULL AND project.deleted_at IS NULL AND test_run.status = 'active'),
        (SELECT COUNT(*) FROM public.test_result_ingestions AS ingestion WHERE ingestion.organization_id = workspace.id),
        (SELECT COUNT(*) FROM public.upload_sessions AS upload
          WHERE upload.organization_id = workspace.id AND upload.completed_at IS NULL AND upload.expires_at > CURRENT_TIMESTAMP),
        (SELECT COALESCE(SUM(upload.size_bytes), 0)::NUMERIC FROM public.upload_sessions AS upload
          WHERE upload.organization_id = workspace.id AND upload.completed_at IS NULL AND upload.expires_at > CURRENT_TIMESTAMP),
        CURRENT_TIMESTAMP
    FROM public.organizations AS workspace WHERE workspace.id = workspace_id;
END
$$;

REVOKE ALL ON FUNCTION public.list_staff_workspace_customers(UUID, INTEGER, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_workspace_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_staff_workspace_customers(UUID, INTEGER, TEXT, TEXT, UUID) TO caselog_app;
GRANT EXECUTE ON FUNCTION public.staff_workspace_usage(UUID) TO caselog_app;
