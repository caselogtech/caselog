DROP INDEX IF EXISTS "idx_upload_sessions_org_case_version_completed_expires";

ALTER TABLE "upload_sessions"
    DROP CONSTRAINT IF EXISTS "upload_sessions_case_version_fkey",
    DROP CONSTRAINT IF EXISTS "chk_upload_sessions_target";

DELETE FROM "upload_sessions"
WHERE "case_version_id" IS NOT NULL;

ALTER TABLE "upload_sessions"
    ALTER COLUMN "test_run_id" SET NOT NULL,
    ALTER COLUMN "test_run_item_id" SET NOT NULL,
    DROP COLUMN IF EXISTS "case_version_id";
