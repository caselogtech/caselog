CREATE FUNCTION caselog.reject_staff_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'staff audit history is immutable' USING ERRCODE = '23000';
END
$$;

CREATE TRIGGER "staff_audit_logs_immutable"
BEFORE UPDATE ON "staff_audit_logs"
FOR EACH ROW EXECUTE FUNCTION caselog.reject_staff_audit_mutation();

CREATE OR REPLACE FUNCTION public.list_staff_audit_logs(after_id UUID, result_limit INTEGER)
RETURNS TABLE (
    id UUID,
    actor_user_id UUID,
    actor_email CITEXT,
    actor_display_name VARCHAR(120),
    action VARCHAR(100),
    target_type VARCHAR(80),
    target_id VARCHAR(200),
    reason VARCHAR(500),
    metadata JSONB,
    created_at TIMESTAMPTZ(3)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM caselog.require_staff_role('owner');
    RETURN QUERY
    SELECT
        audit.id,
        audit.actor_user_id,
        identity.email,
        identity.display_name,
        audit.action,
        audit.target_type,
        audit.target_id,
        audit.reason,
        audit.metadata,
        audit.created_at
    FROM public.staff_audit_logs AS audit
    JOIN public.users AS identity ON identity.id = audit.actor_user_id
    WHERE after_id IS NULL OR (audit.created_at, audit.id) < (
        SELECT cursor.created_at, cursor.id
        FROM public.staff_audit_logs AS cursor
        WHERE cursor.id = after_id
    )
    ORDER BY audit.created_at DESC, audit.id DESC
    LIMIT LEAST(GREATEST(result_limit, 1), 101);
END
$$;
