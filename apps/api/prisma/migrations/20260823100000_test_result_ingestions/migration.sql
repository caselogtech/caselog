CREATE TYPE "result_ingestion_format" AS ENUM ('junit');
CREATE TYPE "result_ingestion_status" AS ENUM ('completed', 'failed');

CREATE TABLE "test_result_ingestions" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "initiated_by_id" UUID,
    "format" "result_ingestion_format" NOT NULL,
    "status" "result_ingestion_status" NOT NULL,
    "source" VARCHAR(120) NOT NULL,
    "pipeline" VARCHAR(200),
    "branch" VARCHAR(255),
    "total" INTEGER NOT NULL DEFAULT 0,
    "recorded" INTEGER NOT NULL DEFAULT 0,
    "unmatched" INTEGER NOT NULL DEFAULT 0,
    "truncated" INTEGER NOT NULL DEFAULT 0,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(100),
    "error_message" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_test_result_ingestions" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "chk_test_result_ingestions_counts" CHECK (
        "total" >= 0 AND
        "recorded" >= 0 AND
        "unmatched" >= 0 AND
        "truncated" >= 0 AND
        "passed" >= 0 AND
        "failed" >= 0 AND
        "errors" >= 0 AND
        "skipped" >= 0 AND
        "recorded" + "unmatched" = "total" AND
        "passed" + "failed" + "errors" + "skipped" = "total"
    ),
    CONSTRAINT "chk_test_result_ingestions_outcome" CHECK (
        ("status" = 'completed' AND "error_code" IS NULL AND "error_message" IS NULL) OR
        ("status" = 'failed' AND "total" = 0 AND "error_code" IS NOT NULL)
    ),
    CONSTRAINT "test_result_ingestions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "test_result_ingestions_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "test_result_ingestions_run_fkey"
        FOREIGN KEY ("organization_id", "test_run_id")
        REFERENCES "test_runs"("organization_id", "id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "test_result_ingestions_initiated_by_id_fkey"
        FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_result_ingestions_org_project_created_id"
    ON "test_result_ingestions"("organization_id", "project_id", "created_at", "id");
CREATE INDEX "idx_result_ingestions_org_run_created_id"
    ON "test_result_ingestions"("organization_id", "test_run_id", "created_at", "id");

ALTER TABLE "test_result_ingestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "test_result_ingestions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "test_result_ingestions"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT, UPDATE, DELETE ON "test_result_ingestions" TO caselog_app;
