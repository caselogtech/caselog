ALTER TABLE "attachments"
    ADD COLUMN "step_position" INTEGER;

ALTER TABLE "attachments"
    ADD CONSTRAINT "chk_attachments_step_position"
    CHECK ("step_position" IS NULL OR "step_position" BETWEEN 0 AND 199);

CREATE TABLE "upload_sessions" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "test_run_item_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(255) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "step_position" INTEGER,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_upload_sessions" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "chk_upload_sessions_size_bytes"
        CHECK ("size_bytes" BETWEEN 1 AND 104857600),
    CONSTRAINT "chk_upload_sessions_checksum_sha256"
        CHECK ("checksum_sha256" ~ '^[0-9A-Fa-f]{64}$'),
    CONSTRAINT "chk_upload_sessions_step_position"
        CHECK ("step_position" IS NULL OR "step_position" BETWEEN 0 AND 199),
    CONSTRAINT "chk_upload_sessions_expiry"
        CHECK ("expires_at" > "created_at"),
    CONSTRAINT "chk_upload_sessions_completion"
        CHECK ("completed_at" IS NULL OR "completed_at" >= "created_at")
);

CREATE UNIQUE INDEX "uq_upload_sessions_organization_id_storage_key"
    ON "upload_sessions"("organization_id", "storage_key");
CREATE INDEX "idx_upload_sessions_org_item_completed_expires"
    ON "upload_sessions"("organization_id", "test_run_item_id", "completed_at", "expires_at");
CREATE INDEX "idx_upload_sessions_organization_id_expires_at"
    ON "upload_sessions"("organization_id", "expires_at");

ALTER TABLE "upload_sessions"
    ADD CONSTRAINT "upload_sessions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "upload_sessions_project_fkey"
    FOREIGN KEY ("organization_id", "project_id")
    REFERENCES "projects"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "upload_sessions_test_run_fkey"
    FOREIGN KEY ("organization_id", "test_run_id")
    REFERENCES "test_runs"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "upload_sessions_test_run_item_fkey"
    FOREIGN KEY ("organization_id", "test_run_item_id")
    REFERENCES "test_run_items"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "upload_sessions_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "upload_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "upload_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "upload_sessions"
    USING (organization_id = caselog.current_organization_id())
    WITH CHECK (organization_id = caselog.current_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "upload_sessions" TO caselog_app;
