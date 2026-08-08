CREATE TABLE "workspace_invitations" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "role" "membership_role" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pk_workspace_invitations" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "chk_workspace_invitations_role" CHECK ("role" <> 'owner'),
    CONSTRAINT "chk_workspace_invitations_hash" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "chk_workspace_invitations_expiry" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "workspace_invitations_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "workspace_invitations_invited_by_id_fkey"
      FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_workspace_invitations_token_hash"
    ON "workspace_invitations"("token_hash");
CREATE UNIQUE INDEX "uq_workspace_invitations_organization_email"
    ON "workspace_invitations"("organization_id", "email");
CREATE INDEX "idx_workspace_invitations_organization_created_at_id"
    ON "workspace_invitations"("organization_id", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_workspace_invitations_organization_expires_at"
    ON "workspace_invitations"("organization_id", "expires_at");

ALTER TABLE "workspace_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "workspace_invitations"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT, UPDATE, DELETE ON "workspace_invitations" TO caselog_app;
