CREATE TABLE "test_step_results" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "test_result_id" UUID NOT NULL,
    "result_executed_at" TIMESTAMPTZ(3) NOT NULL,
    "status_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "comment" TEXT,
    "elapsed_ms" INTEGER,

    CONSTRAINT "pk_test_step_results" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "chk_test_step_results_position" CHECK ("position" >= 0),
    CONSTRAINT "chk_test_step_results_elapsed_ms" CHECK ("elapsed_ms" IS NULL OR "elapsed_ms" >= 0)
);

CREATE UNIQUE INDEX "uq_test_step_results_result_position"
    ON "test_step_results"("organization_id", "test_result_id", "result_executed_at", "position");
CREATE INDEX "idx_test_step_results_organization_id_status_id"
    ON "test_step_results"("organization_id", "status_id");

ALTER TABLE "test_step_results"
    ADD CONSTRAINT "test_step_results_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "test_step_results_result_fkey"
    FOREIGN KEY ("organization_id", "test_result_id", "result_executed_at")
    REFERENCES "test_results"("organization_id", "id", "executed_at")
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "test_step_results_status_fkey"
    FOREIGN KEY ("organization_id", "status_id")
    REFERENCES "result_statuses"("organization_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "test_step_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "test_step_results" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "test_step_results"
    USING (organization_id = caselog.current_organization_id())
    WITH CHECK (organization_id = caselog.current_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "test_step_results" TO caselog_app;
