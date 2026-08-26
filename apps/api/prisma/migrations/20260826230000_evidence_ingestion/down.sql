DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "current_evidence_observations"
        GROUP BY "organization_id", "candidate_id", "metric_key", "dimensions_hash"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'cannot collapse producer-scoped current evidence during rollback';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "api_tokens"
        WHERE 'evidence:write'::public."api_token_scope" = ANY("scopes")
    ) THEN
        RAISE EXCEPTION 'revoke evidence:write API tokens before rollback';
    END IF;
END;
$$;

ALTER TABLE "current_evidence_observations"
    DROP CONSTRAINT "current_evidence_observations_producer_fkey",
    DROP CONSTRAINT "pk_current_evidence_observations",
    ADD CONSTRAINT "pk_current_evidence_observations"
        PRIMARY KEY ("organization_id", "candidate_id", "metric_key", "dimensions_hash"),
    DROP COLUMN "producer_id";

ALTER TABLE "evidence_observations"
    DROP CONSTRAINT "chk_evidence_observations_request_hash",
    DROP COLUMN "request_hash";

DROP FUNCTION public.authenticate_api_token(CHAR(64));
ALTER TYPE public."api_token_scope" RENAME TO "api_token_scope_with_evidence";
CREATE TYPE public."api_token_scope" AS ENUM ('results:write', 'runs:read');

ALTER TABLE "api_tokens"
    ALTER COLUMN "scopes" TYPE public."api_token_scope"[]
    USING "scopes"::TEXT[]::public."api_token_scope"[];

DROP TYPE public."api_token_scope_with_evidence";

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
