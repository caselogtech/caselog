CREATE TYPE "staff_operator_role" AS ENUM ('owner', 'admin', 'support');

CREATE TABLE "staff_operators" (
    "user_id" UUID NOT NULL,
    "role" "staff_operator_role" NOT NULL,
    "access_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "disabled_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_operators_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "chk_staff_operators_expiry" CHECK ("access_expires_at" > "created_at"),
    CONSTRAINT "chk_staff_operators_disabled_at" CHECK (
        "disabled_at" IS NULL OR "disabled_at" >= "created_at"
    )
);

CREATE TABLE "staff_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" VARCHAR(200),
    "reason" VARCHAR(500),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_staff_operators_active"
    ON "staff_operators"("disabled_at", "access_expires_at");
CREATE INDEX "idx_staff_audit_logs_created_at_id"
    ON "staff_audit_logs"("created_at", "id");
CREATE INDEX "idx_staff_audit_logs_actor_created_at"
    ON "staff_audit_logs"("actor_user_id", "created_at");

ALTER TABLE "staff_operators"
    ADD CONSTRAINT "staff_operators_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "staff_operators_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_audit_logs"
    ADD CONSTRAINT "staff_audit_logs_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Global staff data and cross-tenant projections are inaccessible through ordinary
-- application queries. Narrow SECURITY DEFINER functions below enforce current-user
-- operator access before exposing redacted operational metadata.
ALTER TABLE "staff_operators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_operators" FORCE ROW LEVEL SECURITY;
ALTER TABLE "staff_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_audit_logs" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "staff_operators", "staff_audit_logs" FROM caselog_app;

CREATE FUNCTION caselog.staff_role_rank(candidate public.staff_operator_role)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE candidate
        WHEN 'support'::public.staff_operator_role THEN 1
        WHEN 'admin'::public.staff_operator_role THEN 2
        WHEN 'owner'::public.staff_operator_role THEN 3
    END
$$;

CREATE FUNCTION caselog.current_staff_role()
RETURNS public.staff_operator_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT operator.role
    FROM public.staff_operators AS operator
    JOIN public.users AS identity ON identity.id = operator.user_id
    WHERE operator.user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID
      AND operator.disabled_at IS NULL
      AND operator.access_expires_at > CURRENT_TIMESTAMP
      AND identity.deleted_at IS NULL
      AND identity.email_verified_at IS NOT NULL
$$;

CREATE FUNCTION caselog.require_staff_role(required_role public.staff_operator_role)
RETURNS public.staff_operator_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    active_role public.staff_operator_role := caselog.current_staff_role();
BEGIN
    IF active_role IS NULL
       OR caselog.staff_role_rank(active_role) < caselog.staff_role_rank(required_role) THEN
        RAISE EXCEPTION 'Active staff access is required' USING ERRCODE = '42501';
    END IF;
    RETURN active_role;
END
$$;

CREATE FUNCTION public.current_user_staff_operator()
RETURNS TABLE (
    user_id UUID,
    email CITEXT,
    display_name VARCHAR(120),
    role public.staff_operator_role,
    access_expires_at TIMESTAMPTZ(3),
    disabled_at TIMESTAMPTZ(3),
    created_at TIMESTAMPTZ(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        operator.user_id,
        identity.email,
        identity.display_name,
        operator.role,
        operator.access_expires_at,
        operator.disabled_at,
        operator.created_at
    FROM public.staff_operators AS operator
    JOIN public.users AS identity ON identity.id = operator.user_id
    WHERE operator.user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID
      AND operator.disabled_at IS NULL
      AND operator.access_expires_at > CURRENT_TIMESTAMP
      AND identity.deleted_at IS NULL
      AND identity.email_verified_at IS NOT NULL
$$;

CREATE FUNCTION public.bootstrap_current_user_staff_operator(
    configured_email CITEXT,
    bootstrap_expires_at TIMESTAMPTZ(3)
)
RETURNS TABLE (
    user_id UUID,
    email CITEXT,
    display_name VARCHAR(120),
    role public.staff_operator_role,
    access_expires_at TIMESTAMPTZ(3),
    disabled_at TIMESTAMPTZ(3),
    created_at TIMESTAMPTZ(3)
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    session_user_id UUID := NULLIF(current_setting('caselog.user_id', true), '')::UUID;
BEGIN
    IF session_user_id IS NULL OR bootstrap_expires_at <= CURRENT_TIMESTAMP THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.users AS identity
        WHERE identity.id = session_user_id
          AND identity.email = configured_email
          AND identity.deleted_at IS NULL
          AND identity.email_verified_at IS NOT NULL
    ) THEN
        RETURN;
    END IF;

    INSERT INTO public.staff_operators (
        user_id, role, access_expires_at, created_by_id, updated_at
    )
    SELECT session_user_id, 'owner', bootstrap_expires_at, session_user_id, CURRENT_TIMESTAMP
    WHERE NOT EXISTS (SELECT 1 FROM public.staff_operators)
    ON CONFLICT ON CONSTRAINT staff_operators_pkey DO NOTHING;

    IF FOUND THEN
        INSERT INTO public.staff_audit_logs (
            actor_user_id, action, target_type, target_id, reason, metadata
        ) VALUES (
            session_user_id,
            'staff.operator.bootstrapped',
            'staff_operator',
            session_user_id::TEXT,
            'Initial operator bootstrap from deployment configuration',
            jsonb_build_object('accessExpiresAt', bootstrap_expires_at)
        );
    END IF;

    RETURN QUERY SELECT * FROM public.current_user_staff_operator();
END
$$;

CREATE FUNCTION public.staff_overview()
RETURNS TABLE (
    user_count BIGINT,
    active_workspace_count BIGINT,
    deleted_workspace_count BIGINT,
    billing_account_count BIGINT,
    active_project_count BIGINT,
    storage_bytes NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM caselog.require_staff_role('support');
    RETURN QUERY SELECT
        (SELECT COUNT(*) FROM public.users WHERE deleted_at IS NULL),
        (SELECT COUNT(*) FROM public.organizations WHERE deleted_at IS NULL),
        (SELECT COUNT(*) FROM public.organizations WHERE deleted_at IS NOT NULL),
        (SELECT COUNT(*) FROM public.billing_accounts),
        (SELECT COUNT(*) FROM public.projects WHERE deleted_at IS NULL),
        (SELECT COALESCE(SUM(storage_bytes_used), 0) FROM public.usage_counters);
END
$$;

CREATE FUNCTION public.list_staff_users(
    after_id UUID,
    result_limit INTEGER,
    search_query TEXT
)
RETURNS TABLE (
    id UUID,
    email CITEXT,
    display_name VARCHAR(120),
    email_verified BOOLEAN,
    active_workspace_count BIGINT,
    billing_account_count BIGINT,
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
        identity.id,
        identity.email,
        identity.display_name,
        identity.email_verified_at IS NOT NULL,
        (SELECT COUNT(*) FROM public.memberships AS membership
          WHERE membership.user_id = identity.id AND membership.deleted_at IS NULL),
        (SELECT COUNT(*) FROM public.billing_account_memberships AS membership
          WHERE membership.user_id = identity.id AND membership.deleted_at IS NULL),
        identity.created_at,
        identity.deleted_at
    FROM public.users AS identity
    WHERE (after_id IS NULL OR identity.id > after_id)
      AND (
        search_query IS NULL
        OR identity.email ILIKE '%' || search_query || '%'
        OR identity.display_name ILIKE '%' || search_query || '%'
      )
    ORDER BY identity.id
    LIMIT LEAST(GREATEST(result_limit, 1), 101);
END
$$;

CREATE FUNCTION public.list_staff_workspaces(
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

CREATE FUNCTION public.list_staff_billing_accounts(
    after_id UUID,
    result_limit INTEGER,
    search_query TEXT
)
RETURNS TABLE (
    id UUID,
    name VARCHAR(120),
    owner_email CITEXT,
    member_count BIGINT,
    workspace_count BIGINT,
    storage_bytes NUMERIC,
    created_at TIMESTAMPTZ(3)
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
        account.id,
        account.name,
        owner_identity.email,
        (SELECT COUNT(*) FROM public.billing_account_memberships AS membership
          WHERE membership.billing_account_id = account.id AND membership.deleted_at IS NULL),
        (SELECT COUNT(*) FROM public.organizations AS workspace
          WHERE workspace.billing_account_id = account.id AND workspace.deleted_at IS NULL),
        (SELECT COALESCE(SUM(usage.storage_bytes_used), 0)
          FROM public.organizations AS workspace
          LEFT JOIN public.usage_counters AS usage ON usage.organization_id = workspace.id
          WHERE workspace.billing_account_id = account.id AND workspace.deleted_at IS NULL),
        account.created_at
    FROM public.billing_accounts AS account
    JOIN public.billing_account_memberships AS owner_membership
      ON owner_membership.billing_account_id = account.id
     AND owner_membership.role = 'owner'
     AND owner_membership.deleted_at IS NULL
    JOIN public.users AS owner_identity ON owner_identity.id = owner_membership.user_id
    WHERE (after_id IS NULL OR account.id > after_id)
      AND (
        search_query IS NULL
        OR account.name ILIKE '%' || search_query || '%'
        OR owner_identity.email ILIKE '%' || search_query || '%'
      )
    ORDER BY account.id
    LIMIT LEAST(GREATEST(result_limit, 1), 101);
END
$$;

CREATE FUNCTION public.list_staff_operators(after_id UUID, result_limit INTEGER)
RETURNS TABLE (
    user_id UUID,
    email CITEXT,
    display_name VARCHAR(120),
    role public.staff_operator_role,
    access_expires_at TIMESTAMPTZ(3),
    disabled_at TIMESTAMPTZ(3),
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
        operator.user_id,
        identity.email,
        identity.display_name,
        operator.role,
        operator.access_expires_at,
        operator.disabled_at,
        operator.created_at
    FROM public.staff_operators AS operator
    JOIN public.users AS identity ON identity.id = operator.user_id
    WHERE after_id IS NULL OR operator.user_id > after_id
    ORDER BY operator.user_id
    LIMIT LEAST(GREATEST(result_limit, 1), 101);
END
$$;

CREATE FUNCTION public.grant_staff_operator(
    target_email CITEXT,
    target_role public.staff_operator_role,
    target_expires_at TIMESTAMPTZ(3),
    change_reason VARCHAR(500)
)
RETURNS TABLE (
    outcome TEXT,
    user_id UUID,
    email CITEXT,
    display_name VARCHAR(120),
    role public.staff_operator_role,
    access_expires_at TIMESTAMPTZ(3),
    disabled_at TIMESTAMPTZ(3),
    created_at TIMESTAMPTZ(3)
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_id UUID := NULLIF(current_setting('caselog.user_id', true), '')::UUID;
    target_user public.users%ROWTYPE;
    previous_operator public.staff_operators%ROWTYPE;
    resulting_operator public.staff_operators%ROWTYPE;
BEGIN
    PERFORM caselog.require_staff_role('owner');
    IF target_expires_at <= CURRENT_TIMESTAMP
       OR target_expires_at > CURRENT_TIMESTAMP + INTERVAL '90 days' THEN
        RETURN QUERY SELECT 'invalid_expiry', NULL::UUID, NULL::CITEXT, NULL::VARCHAR(120),
            NULL::public.staff_operator_role, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    SELECT * INTO target_user FROM public.users AS identity
    WHERE identity.email = target_email
      AND identity.deleted_at IS NULL
      AND identity.email_verified_at IS NOT NULL;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'user_not_found', NULL::UUID, NULL::CITEXT, NULL::VARCHAR(120),
            NULL::public.staff_operator_role, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    LOCK TABLE public.staff_operators IN SHARE ROW EXCLUSIVE MODE;
    SELECT * INTO previous_operator FROM public.staff_operators
    WHERE staff_operators.user_id = target_user.id;

    IF FOUND
       AND previous_operator.role = 'owner'
       AND previous_operator.disabled_at IS NULL
       AND previous_operator.access_expires_at > CURRENT_TIMESTAMP
       AND target_role <> 'owner'
       AND (SELECT COUNT(*) FROM public.staff_operators AS active_operator
            WHERE active_operator.role = 'owner' AND active_operator.disabled_at IS NULL
              AND active_operator.access_expires_at > CURRENT_TIMESTAMP) <= 1 THEN
        RETURN QUERY SELECT 'last_owner', NULL::UUID, NULL::CITEXT, NULL::VARCHAR(120),
            NULL::public.staff_operator_role, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    INSERT INTO public.staff_operators (
        user_id, role, access_expires_at, disabled_at, created_by_id, updated_at
    ) VALUES (
        target_user.id, target_role, target_expires_at, NULL, actor_id, CURRENT_TIMESTAMP
    )
    ON CONFLICT ON CONSTRAINT staff_operators_pkey DO UPDATE SET
        role = EXCLUDED.role,
        access_expires_at = EXCLUDED.access_expires_at,
        disabled_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    RETURNING * INTO resulting_operator;

    INSERT INTO public.staff_audit_logs (
        actor_user_id, action, target_type, target_id, reason, metadata
    ) VALUES (
        actor_id,
        'staff.operator.granted',
        'staff_operator',
        target_user.id::TEXT,
        change_reason,
        jsonb_build_object('role', target_role, 'accessExpiresAt', target_expires_at)
    );

    RETURN QUERY SELECT
        'ok', resulting_operator.user_id, target_user.email, target_user.display_name,
        resulting_operator.role, resulting_operator.access_expires_at,
        resulting_operator.disabled_at, resulting_operator.created_at;
END
$$;

CREATE FUNCTION public.revoke_staff_operator(target_user_id UUID, change_reason VARCHAR(500))
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_id UUID := NULLIF(current_setting('caselog.user_id', true), '')::UUID;
    target_operator public.staff_operators%ROWTYPE;
BEGIN
    PERFORM caselog.require_staff_role('owner');
    IF target_user_id = actor_id THEN
        RETURN 'self_revoke';
    END IF;

    LOCK TABLE public.staff_operators IN SHARE ROW EXCLUSIVE MODE;
    SELECT * INTO target_operator FROM public.staff_operators
    WHERE staff_operators.user_id = target_user_id;
    IF NOT FOUND OR target_operator.disabled_at IS NOT NULL THEN
        RETURN 'not_found';
    END IF;

    IF target_operator.role = 'owner'
       AND target_operator.access_expires_at > CURRENT_TIMESTAMP
       AND (SELECT COUNT(*) FROM public.staff_operators AS active_operator
            WHERE active_operator.role = 'owner' AND active_operator.disabled_at IS NULL
              AND active_operator.access_expires_at > CURRENT_TIMESTAMP) <= 1 THEN
        RETURN 'last_owner';
    END IF;

    UPDATE public.staff_operators
    SET disabled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE staff_operators.user_id = target_user_id;

    INSERT INTO public.staff_audit_logs (
        actor_user_id, action, target_type, target_id, reason, metadata
    ) VALUES (
        actor_id, 'staff.operator.revoked', 'staff_operator', target_user_id::TEXT,
        change_reason, jsonb_build_object('role', target_operator.role)
    );
    RETURN 'ok';
END
$$;

CREATE FUNCTION public.list_staff_audit_logs(after_id UUID, result_limit INTEGER)
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
    WHERE after_id IS NULL OR audit.id > after_id
    ORDER BY audit.id
    LIMIT LEAST(GREATEST(result_limit, 1), 101);
END
$$;

REVOKE ALL ON FUNCTION caselog.staff_role_rank(public.staff_operator_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION caselog.current_staff_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION caselog.require_staff_role(public.staff_operator_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_staff_operator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_current_user_staff_operator(CITEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_staff_users(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_staff_workspaces(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_staff_billing_accounts(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_staff_operators(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_staff_operator(CITEXT, public.staff_operator_role, TIMESTAMPTZ, VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_staff_operator(UUID, VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_staff_audit_logs(UUID, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_staff_operator() TO caselog_app;
GRANT EXECUTE ON FUNCTION public.bootstrap_current_user_staff_operator(CITEXT, TIMESTAMPTZ) TO caselog_app;
GRANT EXECUTE ON FUNCTION public.staff_overview() TO caselog_app;
GRANT EXECUTE ON FUNCTION public.list_staff_users(UUID, INTEGER, TEXT) TO caselog_app;
GRANT EXECUTE ON FUNCTION public.list_staff_workspaces(UUID, INTEGER, TEXT) TO caselog_app;
GRANT EXECUTE ON FUNCTION public.list_staff_billing_accounts(UUID, INTEGER, TEXT) TO caselog_app;
GRANT EXECUTE ON FUNCTION public.list_staff_operators(UUID, INTEGER) TO caselog_app;
GRANT EXECUTE ON FUNCTION public.grant_staff_operator(CITEXT, public.staff_operator_role, TIMESTAMPTZ, VARCHAR) TO caselog_app;
GRANT EXECUTE ON FUNCTION public.revoke_staff_operator(UUID, VARCHAR) TO caselog_app;
GRANT EXECUTE ON FUNCTION public.list_staff_audit_logs(UUID, INTEGER) TO caselog_app;
