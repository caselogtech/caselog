CREATE OR REPLACE FUNCTION caselog.require_staff_role(required_role public.staff_operator_role)
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
