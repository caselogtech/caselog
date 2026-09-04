ALTER FUNCTION public.grant_staff_operator(CITEXT, public.staff_operator_role, TIMESTAMPTZ, VARCHAR)
    RESET plpgsql.variable_conflict;
ALTER FUNCTION public.revoke_staff_operator(UUID, VARCHAR)
    RESET plpgsql.variable_conflict;
