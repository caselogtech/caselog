CREATE TABLE "issue_links" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "link_type" VARCHAR(30) NOT NULL,
    "test_case_id" UUID,
    "test_result_id" UUID,
    "test_result_executed_at" TIMESTAMPTZ(3),
    "external_issue_id" VARCHAR(255) NOT NULL,
    "external_issue_key" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "issue_type" VARCHAR(120) NOT NULL,
    "status_id" VARCHAR(255),
    "status_name" VARCHAR(255),
    "last_synced_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_issue_links" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "chk_issue_links_target" CHECK (
        (("test_case_id" IS NOT NULL)::INTEGER + ("test_result_id" IS NOT NULL)::INTEGER) = 1
    ),
    CONSTRAINT "chk_issue_links_result_timestamp" CHECK (
        ("test_result_id" IS NULL) = ("test_result_executed_at" IS NULL)
    ),
    CONSTRAINT "chk_issue_links_type" CHECK (
        ("test_case_id" IS NOT NULL AND "link_type" = 'requirement') OR
        ("test_result_id" IS NOT NULL AND "link_type" = 'defect')
    )
);

CREATE UNIQUE INDEX "uq_issue_links_case_external_active"
    ON "issue_links"("organization_id", "connection_id", "test_case_id", "external_issue_id")
    WHERE "test_case_id" IS NOT NULL AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "uq_issue_links_result_external_active"
    ON "issue_links"(
        "organization_id", "connection_id", "test_result_id",
        "test_result_executed_at", "external_issue_id"
    )
    WHERE "test_result_id" IS NOT NULL AND "deleted_at" IS NULL;

CREATE INDEX "idx_issue_links_organization_project"
    ON "issue_links"("organization_id", "project_id", "deleted_at");
CREATE INDEX "idx_issue_links_external_issue"
    ON "issue_links"("organization_id", "connection_id", "external_issue_id");
CREATE INDEX "idx_issue_links_test_case"
    ON "issue_links"("organization_id", "test_case_id", "deleted_at");
CREATE INDEX "idx_issue_links_test_result"
    ON "issue_links"("organization_id", "test_result_id", "test_result_executed_at", "deleted_at");

ALTER TABLE "issue_links"
    ADD CONSTRAINT "issue_links_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_links"
    ADD CONSTRAINT "issue_links_project_id_fkey"
    FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_links"
    ADD CONSTRAINT "issue_links_connection_id_fkey"
    FOREIGN KEY ("organization_id", "connection_id") REFERENCES "integration_connections"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_links"
    ADD CONSTRAINT "issue_links_test_case_id_fkey"
    FOREIGN KEY ("organization_id", "test_case_id") REFERENCES "test_cases"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_links"
    ADD CONSTRAINT "issue_links_test_result_id_fkey"
    FOREIGN KEY ("organization_id", "test_result_id", "test_result_executed_at")
    REFERENCES "test_results"("organization_id", "id", "executed_at")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_links"
    ADD CONSTRAINT "issue_links_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "issue_creation_requests" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "test_result_id" UUID NOT NULL,
    "test_result_executed_at" TIMESTAMPTZ(3) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "state" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "response" JSONB,
    "last_error" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_issue_creation_requests" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_issue_creation_requests_organization_key" UNIQUE ("organization_id", "idempotency_key"),
    CONSTRAINT "chk_issue_creation_requests_hash" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "chk_issue_creation_requests_state" CHECK (
        "state" IN ('pending', 'completed', 'failed', 'reconciliation_required')
    ),
    CONSTRAINT "chk_issue_creation_requests_response" CHECK (
        ("state" = 'completed' AND "response" IS NOT NULL) OR
        ("state" <> 'completed' AND "response" IS NULL)
    )
);

CREATE INDEX "idx_issue_creation_requests_connection_state"
    ON "issue_creation_requests"("organization_id", "connection_id", "state", "updated_at");
CREATE INDEX "idx_issue_creation_requests_test_result"
    ON "issue_creation_requests"("organization_id", "test_result_id", "test_result_executed_at");

ALTER TABLE "issue_creation_requests"
    ADD CONSTRAINT "issue_creation_requests_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_creation_requests"
    ADD CONSTRAINT "issue_creation_requests_project_id_fkey"
    FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_creation_requests"
    ADD CONSTRAINT "issue_creation_requests_connection_id_fkey"
    FOREIGN KEY ("organization_id", "connection_id") REFERENCES "integration_connections"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_creation_requests"
    ADD CONSTRAINT "issue_creation_requests_test_result_id_fkey"
    FOREIGN KEY ("organization_id", "test_result_id", "test_result_executed_at")
    REFERENCES "test_results"("organization_id", "id", "executed_at")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_creation_requests"
    ADD CONSTRAINT "issue_creation_requests_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "issue_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "issue_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "issue_links"
    USING (organization_id = caselog.current_organization_id())
    WITH CHECK (organization_id = caselog.current_organization_id());

ALTER TABLE "issue_creation_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "issue_creation_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "issue_creation_requests"
    USING (organization_id = caselog.current_organization_id())
    WITH CHECK (organization_id = caselog.current_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "issue_links" TO caselog_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "issue_creation_requests" TO caselog_app;
