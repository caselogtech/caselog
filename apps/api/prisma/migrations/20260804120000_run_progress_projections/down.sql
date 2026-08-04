DROP TABLE IF EXISTS "run_progress_snapshots";

ALTER TABLE "test_runs"
    DROP COLUMN IF EXISTS "report_revision";
