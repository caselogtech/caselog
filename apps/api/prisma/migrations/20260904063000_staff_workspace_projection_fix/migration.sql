CREATE OR REPLACE FUNCTION public.list_staff_workspaces(
    after_id UUID,
    result_limit INTEGER,
    search_query TEXT
)
RETURNS TABLE (
    id UUID,
    name VARCHAR(120),
    slug VARCHAR(30),
    billing_account_id UUID,
    billing_account_name VARCHAR(120),
    member_count BIGINT,
    project_count BIGINT,
    storage_bytes NUMERIC,
    created_at TIMESTAMPTZ(3),
    deleted_at TIMESTAMPTZ(3)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM caselog.require_staff_role('admin');
    RETURN QUERY
    SELECT
        workspace.id,
        workspace.name,
        workspace.slug,
        account.id,
        account.name,
        (SELECT COUNT(*) FROM public.memberships AS membership
          WHERE membership.organization_id = workspace.id AND membership.deleted_at IS NULL),
        (SELECT COUNT(*) FROM public.projects AS project
          WHERE project.organization_id = workspace.id AND project.deleted_at IS NULL),
        COALESCE(usage.storage_bytes_used, 0)::NUMERIC,
        workspace.created_at,
        workspace.deleted_at
    FROM public.organizations AS workspace
    LEFT JOIN public.billing_accounts AS account ON account.id = workspace.billing_account_id
    LEFT JOIN public.usage_counters AS usage ON usage.organization_id = workspace.id
    WHERE (after_id IS NULL OR workspace.id > after_id)
      AND (
        search_query IS NULL
        OR workspace.name ILIKE '%' || search_query || '%'
        OR workspace.slug ILIKE '%' || search_query || '%'
      )
    ORDER BY workspace.id
    LIMIT LEAST(GREATEST(result_limit, 1), 101);
END
$$;
