DROP FUNCTION IF EXISTS public.current_user_billing_account_role(UUID);
DROP FUNCTION IF EXISTS public.list_current_user_billing_accounts();
DROP FUNCTION IF EXISTS public.create_current_user_billing_account(VARCHAR);

DROP POLICY IF EXISTS "billing_account_member_access" ON "billing_accounts";

ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_billing_account_id_fkey";
DROP INDEX IF EXISTS "idx_organizations_billing_account_active";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "billing_account_id";

DROP TABLE IF EXISTS "billing_account_memberships";
DROP TABLE IF EXISTS "billing_accounts";
DROP TYPE IF EXISTS "billing_account_role";
