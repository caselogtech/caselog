DROP FUNCTION IF EXISTS public.list_staff_audit_logs(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.revoke_staff_operator(UUID, VARCHAR);
DROP FUNCTION IF EXISTS public.grant_staff_operator(CITEXT, public.staff_operator_role, TIMESTAMPTZ, VARCHAR);
DROP FUNCTION IF EXISTS public.list_staff_operators(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.list_staff_billing_accounts(UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.list_staff_workspaces(UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.list_staff_users(UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.staff_overview();
DROP FUNCTION IF EXISTS public.bootstrap_current_user_staff_operator(CITEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.current_user_staff_operator();
DROP FUNCTION IF EXISTS caselog.require_staff_role(public.staff_operator_role);
DROP FUNCTION IF EXISTS caselog.current_staff_role();
DROP FUNCTION IF EXISTS caselog.staff_role_rank(public.staff_operator_role);

DROP TABLE IF EXISTS "staff_audit_logs";
DROP TABLE IF EXISTS "staff_operators";
DROP TYPE IF EXISTS "staff_operator_role";
