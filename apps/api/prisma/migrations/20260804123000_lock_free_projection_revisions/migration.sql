CREATE TABLE "projection_revisions" (
    "organization_id" UUID NOT NULL,
    "projection" VARCHAR(80) NOT NULL,
    "source_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_projection_revisions"
        PRIMARY KEY ("organization_id", "projection", "source_id"),
    CONSTRAINT "chk_projection_revisions_revision" CHECK ("revision" >= 0),
    CONSTRAINT "projection_revisions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_projection_revisions_organization_id_updated_at"
    ON "projection_revisions"("organization_id", "updated_at");

INSERT INTO "projection_revisions" (
    "organization_id",
    "projection",
    "source_id",
    "revision"
)
SELECT "organization_id", 'run_progress', "id", "report_revision"
FROM "test_runs"
WHERE "report_revision" > 0;

ALTER TABLE "test_runs"
    DROP COLUMN "report_revision";

ALTER TABLE "projection_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projection_revisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "projection_revisions"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT, UPDATE, DELETE ON "projection_revisions" TO caselog_app;
