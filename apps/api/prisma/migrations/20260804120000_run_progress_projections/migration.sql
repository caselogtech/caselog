ALTER TABLE "test_runs"
    ADD COLUMN "report_revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "run_progress_snapshots" (
    "organization_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_run_progress_snapshots" PRIMARY KEY ("organization_id", "run_id"),
    CONSTRAINT "chk_run_progress_snapshots_revision" CHECK ("revision" >= 0),
    CONSTRAINT "run_progress_snapshots_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "run_progress_snapshots_run_fkey"
        FOREIGN KEY ("organization_id", "run_id")
        REFERENCES "test_runs"("organization_id", "id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_run_progress_snapshots_organization_id_calculated_at"
    ON "run_progress_snapshots"("organization_id", "calculated_at");

ALTER TABLE "run_progress_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "run_progress_snapshots" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "run_progress_snapshots"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT, UPDATE, DELETE ON "run_progress_snapshots" TO caselog_app;
