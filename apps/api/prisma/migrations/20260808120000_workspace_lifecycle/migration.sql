CREATE TABLE "organization_slug_redirects" (
    "organization_id" UUID NOT NULL,
    "slug" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pk_organization_slug_redirects" PRIMARY KEY ("organization_id", "slug"),
    CONSTRAINT "organization_slug_redirects_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "chk_organization_slug_redirects_slug"
      CHECK ("slug" ~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$')
);

CREATE UNIQUE INDEX "uq_organization_slug_redirects_slug"
    ON "organization_slug_redirects"("slug");

ALTER TABLE "organization_slug_redirects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_slug_redirects" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organization_slug_redirects"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_slug_redirects" TO caselog_app;

-- Session-scoped workspace recovery must cross the tenant boundary before an
-- organization token can be issued. Membership and organization state remain
-- enforced inside this narrow SECURITY DEFINER directory function.
CREATE FUNCTION public.list_current_user_deleted_workspaces()
RETURNS TABLE (
    organization_id UUID,
    name VARCHAR(120),
    slug VARCHAR(30),
    membership_id UUID,
    role public.membership_role,
    deleted_at TIMESTAMPTZ(3),
    recoverable_until TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        organization.id,
        organization.name,
        organization.slug,
        membership.id,
        membership.role,
        organization.deleted_at,
        organization.deleted_at + INTERVAL '30 days'
    FROM public.memberships AS membership
    JOIN public.organizations AS organization
      ON organization.id = membership.organization_id
    WHERE membership.user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID
      AND membership.deleted_at IS NULL
      AND organization.deleted_at IS NOT NULL
      AND organization.deleted_at + INTERVAL '30 days' > CURRENT_TIMESTAMP
    ORDER BY organization.deleted_at DESC, organization.id
$$;

REVOKE ALL ON FUNCTION public.list_current_user_deleted_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_current_user_deleted_workspaces() TO caselog_app;

CREATE FUNCTION public.count_current_user_workspaces()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COUNT(*)
    FROM public.memberships AS membership
    JOIN public.organizations AS organization
      ON organization.id = membership.organization_id
    WHERE membership.user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID
      AND membership.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.count_current_user_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_current_user_workspaces() TO caselog_app;

CREATE FUNCTION public.workspace_slug_is_available(candidate VARCHAR(30))
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM public.organizations WHERE slug = candidate
        UNION ALL
        SELECT 1 FROM public.organization_slug_redirects WHERE slug = candidate
    )
$$;

REVOKE ALL ON FUNCTION public.workspace_slug_is_available(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_slug_is_available(VARCHAR) TO caselog_app;

CREATE FUNCTION public.resolve_active_workspace_slug(candidate VARCHAR(30))
RETURNS TABLE (organization_id UUID, name VARCHAR(120), slug VARCHAR(30))
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT organization.id, organization.name, organization.slug
    FROM public.organizations AS organization
    WHERE organization.deleted_at IS NULL
      AND (
        organization.slug = candidate
        OR EXISTS (
          SELECT 1
          FROM public.organization_slug_redirects AS redirect
          WHERE redirect.organization_id = organization.id
            AND redirect.slug = candidate
        )
      )
    ORDER BY (organization.slug = candidate) DESC
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.resolve_active_workspace_slug(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_active_workspace_slug(VARCHAR) TO caselog_app;
