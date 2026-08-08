CREATE TABLE "audit_logs" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID NOT NULL,
    "actor_type" VARCHAR(30) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" VARCHAR(200),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pk_audit_logs" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "audit_logs_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "chk_audit_logs_actor_type" CHECK ("actor_type" IN ('user', 'api_token', 'system')),
    CONSTRAINT "chk_audit_logs_action" CHECK ("action" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

CREATE INDEX "idx_audit_logs_organization_id_created_at_id"
    ON "audit_logs"("organization_id", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_audit_logs_organization_id_action_created_at"
    ON "audit_logs"("organization_id", "action", "created_at" DESC);

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "audit_logs"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT ON "audit_logs" TO caselog_app;
REVOKE UPDATE, DELETE ON "audit_logs" FROM caselog_app;
