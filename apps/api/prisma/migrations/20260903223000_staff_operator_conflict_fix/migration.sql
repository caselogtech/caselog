CREATE OR REPLACE FUNCTION public.bootstrap_current_user_staff_operator(
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

CREATE OR REPLACE FUNCTION public.grant_staff_operator(
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
