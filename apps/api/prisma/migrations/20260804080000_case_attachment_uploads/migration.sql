ALTER TABLE "upload_sessions"
    ALTER COLUMN "test_run_id" DROP NOT NULL,
    ALTER COLUMN "test_run_item_id" DROP NOT NULL,
    ADD COLUMN "case_version_id" UUID;

ALTER TABLE "upload_sessions"
    ADD CONSTRAINT "chk_upload_sessions_target"
    CHECK (
        (
            "test_run_id" IS NOT NULL
            AND "test_run_item_id" IS NOT NULL
            AND "case_version_id" IS NULL
        )
        OR
        (
            "test_run_id" IS NULL
            AND "test_run_item_id" IS NULL
            AND "case_version_id" IS NOT NULL
        )
    ),
    ADD CONSTRAINT "upload_sessions_case_version_fkey"
    FOREIGN KEY ("organization_id", "case_version_id")
    REFERENCES "test_case_versions"("organization_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_upload_sessions_org_case_version_completed_expires"
    ON "upload_sessions"(
        "organization_id",
        "case_version_id",
        "completed_at",
        "expires_at"
    );
