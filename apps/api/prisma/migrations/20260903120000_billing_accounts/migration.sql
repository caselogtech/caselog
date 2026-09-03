CREATE TYPE "billing_account_role" AS ENUM ('owner', 'admin');

CREATE TABLE "billing_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_account_memberships" (
    "billing_account_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "billing_account_role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_billing_account_memberships" PRIMARY KEY ("billing_account_id", "user_id")
);

ALTER TABLE "organizations" ADD COLUMN "billing_account_id" UUID;

CREATE INDEX "idx_billing_accounts_created_by_id_created_at"
    ON "billing_accounts"("created_by_id", "created_at");

CREATE INDEX "idx_billing_account_memberships_user_active"
    ON "billing_account_memberships"("user_id", "deleted_at", "billing_account_id");

CREATE INDEX "idx_organizations_billing_account_active"
    ON "organizations"("billing_account_id", "deleted_at", "id");

CREATE UNIQUE INDEX "uq_billing_account_memberships_active_owner"
    ON "billing_account_memberships"("billing_account_id")
    WHERE "role" = 'owner' AND "deleted_at" IS NULL;

ALTER TABLE "billing_accounts"
    ADD CONSTRAINT "billing_accounts_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_account_memberships"
    ADD CONSTRAINT "billing_account_memberships_billing_account_id_fkey"
    FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_account_memberships"
    ADD CONSTRAINT "billing_account_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organizations"
    ADD CONSTRAINT "organizations_billing_account_id_fkey"
    FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_accounts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "billing_account_member_access" ON "billing_accounts"
USING (
    EXISTS (
        SELECT 1
        FROM public.billing_account_memberships AS membership
        WHERE membership.billing_account_id = billing_accounts.id
          AND membership.user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID
          AND membership.deleted_at IS NULL
    )
);

ALTER TABLE "billing_account_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_account_memberships" FORCE ROW LEVEL SECURITY;

CREATE POLICY "billing_account_membership_self_access" ON "billing_account_memberships"
USING (
    user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID
    AND deleted_at IS NULL
);

-- Mutations use narrow SECURITY DEFINER functions. The application can inspect only
-- records associated with its transaction-local session user.
REVOKE INSERT, UPDATE, DELETE ON "billing_accounts" FROM caselog_app;
REVOKE INSERT, UPDATE, DELETE ON "billing_account_memberships" FROM caselog_app;
GRANT SELECT ON "billing_accounts", "billing_account_memberships" TO caselog_app;

CREATE FUNCTION public.create_current_user_billing_account(account_name VARCHAR(120))
RETURNS TABLE (
    id UUID,
    name VARCHAR(120),
    role public.billing_account_role,
    workspace_count BIGINT,
    created_at TIMESTAMPTZ(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    session_user_id UUID := NULLIF(current_setting('caselog.user_id', true), '')::UUID;
    created_account public.billing_accounts%ROWTYPE;
BEGIN
    IF session_user_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.users
        WHERE users.id = session_user_id
          AND users.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'A valid session user is required' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.billing_accounts (name, created_by_id, updated_at)
    VALUES (account_name, session_user_id, CURRENT_TIMESTAMP)
    RETURNING * INTO created_account;

    INSERT INTO public.billing_account_memberships (
        billing_account_id,
        user_id,
        role,
        updated_at
    )
    VALUES (created_account.id, session_user_id, 'owner', CURRENT_TIMESTAMP);

    RETURN QUERY SELECT
        created_account.id,
        created_account.name,
        'owner'::public.billing_account_role,
        0::BIGINT,
        created_account.created_at;
END
$$;

CREATE FUNCTION public.list_current_user_billing_accounts()
RETURNS TABLE (
    id UUID,
    name VARCHAR(120),
    role public.billing_account_role,
    workspace_count BIGINT,
    created_at TIMESTAMPTZ(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        account.id,
        account.name,
        membership.role,
        COUNT(organization.id)::BIGINT,
        account.created_at
    FROM public.billing_account_memberships AS membership
    JOIN public.billing_accounts AS account
      ON account.id = membership.billing_account_id
    LEFT JOIN public.organizations AS organization
      ON organization.billing_account_id = account.id
     AND organization.deleted_at IS NULL
    WHERE membership.user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID
      AND membership.deleted_at IS NULL
    GROUP BY account.id, account.name, membership.role, account.created_at
    ORDER BY account.name, account.id
$$;

CREATE FUNCTION public.current_user_billing_account_role(account_id UUID)
RETURNS public.billing_account_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT membership.role
    FROM public.billing_account_memberships AS membership
    WHERE membership.billing_account_id = account_id
      AND membership.user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID
      AND membership.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.create_current_user_billing_account(VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_current_user_billing_accounts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_billing_account_role(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_current_user_billing_account(VARCHAR) TO caselog_app;
GRANT EXECUTE ON FUNCTION public.list_current_user_billing_accounts() TO caselog_app;
GRANT EXECUTE ON FUNCTION public.current_user_billing_account_role(UUID) TO caselog_app;
