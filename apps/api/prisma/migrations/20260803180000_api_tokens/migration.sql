CREATE TYPE "api_token_scope" AS ENUM ('results:write', 'runs:read');

CREATE TABLE "api_tokens" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_by_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "token_prefix" VARCHAR(12) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "scopes" "api_token_scope"[] NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_api_tokens" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "chk_api_tokens_hash" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "chk_api_tokens_prefix" CHECK ("token_prefix" ~ '^clg_[A-Za-z0-9_-]{8}$'),
    CONSTRAINT "chk_api_tokens_scopes" CHECK (cardinality("scopes") > 0),
    CONSTRAINT "chk_api_tokens_expiry" CHECK ("expires_at" > "created_at")
);

CREATE UNIQUE INDEX "uq_api_tokens_token_hash" ON "api_tokens"("token_hash");
CREATE INDEX "idx_api_tokens_organization_id_active"
    ON "api_tokens"("organization_id", "revoked_at", "expires_at");
CREATE INDEX "idx_api_tokens_organization_id_created_at"
    ON "api_tokens"("organization_id", "created_at");

ALTER TABLE "api_tokens"
    ADD CONSTRAINT "api_tokens_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "api_tokens"
    ADD CONSTRAINT "api_tokens_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "api_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "api_tokens"
    USING (organization_id = caselog.current_organization_id())
    WITH CHECK (organization_id = caselog.current_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "api_tokens" TO caselog_app;

-- Token lookup must discover the organization before tenant context exists. The
-- SECURITY DEFINER function exposes only an active token's principal and never its hash.
CREATE FUNCTION public.authenticate_api_token(candidate_hash CHAR(64))
RETURNS TABLE (
    api_token_id UUID,
    organization_id UUID,
    created_by_id UUID,
    membership_id UUID,
    role public.membership_role,
    scopes public.api_token_scope[]
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.api_tokens AS token
    SET last_used_at = CURRENT_TIMESTAMP
    FROM public.memberships AS membership, public.organizations AS organization
    WHERE token.token_hash = candidate_hash
      AND token.revoked_at IS NULL
      AND token.expires_at > CURRENT_TIMESTAMP
      AND organization.id = token.organization_id
      AND organization.deleted_at IS NULL
      AND membership.organization_id = token.organization_id
      AND membership.user_id = token.created_by_id
      AND membership.deleted_at IS NULL
    RETURNING
        token.id,
        token.organization_id,
        token.created_by_id,
        membership.id,
        membership.role,
        token.scopes;
END
$$;

REVOKE ALL ON FUNCTION public.authenticate_api_token(CHAR(64)) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authenticate_api_token(CHAR(64)) TO caselog_app;
