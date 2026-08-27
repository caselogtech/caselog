CREATE TABLE "evidence_processing_issues" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "source_event_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "first_failed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_failed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_evidence_processing_issues"
        PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_evidence_processing_issues_source_event"
        UNIQUE ("organization_id", "source_event_id"),
    CONSTRAINT "chk_evidence_processing_issues_attempt_count"
        CHECK ("attempt_count" > 0),
    CONSTRAINT "chk_evidence_processing_issues_failure_time"
        CHECK ("last_failed_at" >= "first_failed_at"),
    CONSTRAINT "chk_evidence_processing_issues_resolution_time"
        CHECK ("resolved_at" IS NULL OR "resolved_at" >= "first_failed_at"),
    CONSTRAINT "evidence_processing_issues_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "evidence_processing_issues_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "evidence_processing_issues_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "evidence_processing_issues_source_event_fkey"
        FOREIGN KEY ("organization_id", "source_event_id")
        REFERENCES "integration_events"("organization_id", "id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_evidence_processing_issues_candidate_status"
    ON "evidence_processing_issues"(
        "organization_id",
        "project_id",
        "candidate_id",
        "resolved_at",
        "last_failed_at",
        "id"
    );

ALTER TABLE "evidence_processing_issues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence_processing_issues" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "evidence_processing_issues"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT, UPDATE ON "evidence_processing_issues" TO caselog_app;
