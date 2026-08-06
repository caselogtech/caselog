ALTER TABLE "issue_links"
    ADD COLUMN "last_sync_attempt_at" TIMESTAMPTZ(3),
    ADD COLUMN "sync_error" TEXT;
