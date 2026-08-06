CREATE TABLE "integration_connections" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" VARCHAR(50) NOT NULL,
    "deployment" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "base_url" VARCHAR(2048) NOT NULL,
    "auth_type" VARCHAR(50) NOT NULL,
    "encrypted_credentials" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "last_error" TEXT,
    "sync_checkpoint" JSONB,
    "verified_at" TIMESTAMPTZ(3),
    "last_synced_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_integration_connections" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "chk_integration_connections_provider" CHECK (length(btrim("provider")) > 0),
    CONSTRAINT "chk_integration_connections_deployment" CHECK (length(btrim("deployment")) > 0),
    CONSTRAINT "chk_integration_connections_auth_type" CHECK (length(btrim("auth_type")) > 0),
    CONSTRAINT "chk_integration_connections_status" CHECK ("status" IN ('active', 'error', 'disabled')),
    CONSTRAINT "chk_integration_connections_credentials" CHECK (jsonb_typeof("encrypted_credentials") = 'object')
);

CREATE UNIQUE INDEX "uq_integration_connections_organization_provider_name_active"
    ON "integration_connections"("organization_id", "provider", lower("name"))
    WHERE "deleted_at" IS NULL;

CREATE INDEX "idx_integration_connections_organization_provider"
    ON "integration_connections"("organization_id", "provider", "deleted_at");

ALTER TABLE "integration_connections"
    ADD CONSTRAINT "integration_connections_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integration_connections"
    ADD CONSTRAINT "integration_connections_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "integration_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_connections" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "integration_connections"
    USING (organization_id = caselog.current_organization_id())
    WITH CHECK (organization_id = caselog.current_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "integration_connections" TO caselog_app;
