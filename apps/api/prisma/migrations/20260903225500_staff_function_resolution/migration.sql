-- The original function is already unambiguous for fresh databases. Force the deployed
-- function to resolve legacy output-variable conflicts as table columns until its next
-- CREATE OR REPLACE on databases that applied the earlier definition.
ALTER FUNCTION public.grant_staff_operator(CITEXT, public.staff_operator_role, TIMESTAMPTZ, VARCHAR)
    SET plpgsql.variable_conflict = 'use_column';
ALTER FUNCTION public.revoke_staff_operator(UUID, VARCHAR)
    SET plpgsql.variable_conflict = 'use_column';
