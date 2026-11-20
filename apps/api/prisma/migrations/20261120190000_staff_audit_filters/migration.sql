CREATE FUNCTION public.search_staff_audit_logs(
    after_id UUID, result_limit INTEGER, operator_query TEXT,
    action_filter TEXT, target_type_filter TEXT, target_id_filter TEXT,
    from_time TIMESTAMPTZ, to_time TIMESTAMPTZ
)
RETURNS TABLE (
    id UUID, actor_user_id UUID, actor_email CITEXT, actor_display_name VARCHAR(120),
    action VARCHAR(100), target_type VARCHAR(80), target_id VARCHAR(200),
    reason VARCHAR(500), metadata JSONB, created_at TIMESTAMPTZ(3)
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    PERFORM caselog.require_staff_role('owner');
    IF from_time IS NOT NULL AND to_time IS NOT NULL AND from_time >= to_time THEN
        RAISE EXCEPTION 'Invalid audit time range' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT
        audit.id, audit.actor_user_id, identity.email, identity.display_name,
        audit.action, audit.target_type, audit.target_id, audit.reason, audit.metadata, audit.created_at
    FROM public.staff_audit_logs AS audit
    JOIN public.users AS identity ON identity.id = audit.actor_user_id
    WHERE (after_id IS NULL OR audit.id > after_id)
      AND (operator_query IS NULL
        OR STRPOS(LOWER(identity.email::TEXT), LOWER(operator_query)) > 0
        OR STRPOS(LOWER(identity.display_name), LOWER(operator_query)) > 0)
      AND (action_filter IS NULL OR audit.action = action_filter)
      AND (target_type_filter IS NULL OR audit.target_type = target_type_filter)
      AND (target_id_filter IS NULL OR audit.target_id = target_id_filter)
      AND (from_time IS NULL OR audit.created_at >= from_time)
      AND (to_time IS NULL OR audit.created_at < to_time)
    ORDER BY audit.id
    LIMIT LEAST(GREATEST(result_limit, 1), 101);
END
$$;

REVOKE ALL ON FUNCTION public.search_staff_audit_logs(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_staff_audit_logs(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO caselog_app;
