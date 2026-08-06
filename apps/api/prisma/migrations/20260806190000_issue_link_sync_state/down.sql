ALTER TABLE "issue_links"
    DROP COLUMN IF EXISTS "sync_error",
    DROP COLUMN IF EXISTS "last_sync_attempt_at";
