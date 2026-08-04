ALTER TABLE "test_runs"
    ADD COLUMN "report_revision" INTEGER NOT NULL DEFAULT 0;

UPDATE "test_runs" AS run
SET "report_revision" = revision."revision"
FROM "projection_revisions" AS revision
WHERE revision."organization_id" = run."organization_id"
  AND revision."projection" = 'run_progress'
  AND revision."source_id" = run."id";

DROP TABLE IF EXISTS "projection_revisions";
