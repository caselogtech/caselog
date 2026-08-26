ALTER TABLE "release_policy_versions"
ADD CONSTRAINT "uq_release_policy_versions_org_project_policy_id"
UNIQUE ("organization_id", "project_id", "policy_id", "id");

CREATE TABLE "candidate_policy_assignments" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_candidate_policy_assignments" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_candidate_policy_assignments_org_project_candidate_id"
        UNIQUE ("organization_id", "project_id", "candidate_id", "id"),
    CONSTRAINT "candidate_policy_assignments_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "candidate_policy_assignments_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "candidate_policy_assignments_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "candidate_policy_assignments_policy_fkey"
        FOREIGN KEY ("organization_id", "project_id", "policy_id")
        REFERENCES "release_policies"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "candidate_policy_assignments_policy_version_fkey"
        FOREIGN KEY ("organization_id", "project_id", "policy_id", "policy_version_id")
        REFERENCES "release_policy_versions"("organization_id", "project_id", "policy_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "candidate_policy_assignments_assigned_by_id_fkey"
        FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_candidate_policy_assignments_org_project_candidate_time"
    ON "candidate_policy_assignments"(
        "organization_id", "project_id", "candidate_id", "assigned_at", "id"
    );

CREATE TABLE "current_candidate_policy_assignments" (
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_current_candidate_policy_assignments"
        PRIMARY KEY ("organization_id", "candidate_id"),
    CONSTRAINT "uq_current_candidate_policy_assignments_assignment"
        UNIQUE ("organization_id", "assignment_id"),
    CONSTRAINT "uq_current_candidate_policy_assignments_org_project_candidate"
        UNIQUE ("organization_id", "project_id", "candidate_id"),
    CONSTRAINT "uq_current_policy_assignment_org_candidate_assignment"
        UNIQUE ("organization_id", "project_id", "candidate_id", "assignment_id"),
    CONSTRAINT "current_candidate_policy_assignments_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "current_candidate_policy_assignments_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "current_candidate_policy_assignments_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "current_candidate_policy_assignments_assignment_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id", "assignment_id")
        REFERENCES "candidate_policy_assignments"(
            "organization_id", "project_id", "candidate_id", "id"
        ) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_current_candidate_policy_assignments_org_project_updated"
    ON "current_candidate_policy_assignments"("organization_id", "project_id", "updated_at");

CREATE FUNCTION "caselog"."reject_candidate_policy_assignment_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'candidate policy assignments are immutable' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER "candidate_policy_assignments_immutable"
BEFORE UPDATE ON "candidate_policy_assignments"
FOR EACH ROW EXECUTE FUNCTION "caselog"."reject_candidate_policy_assignment_update"();

ALTER TABLE "candidate_policy_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "candidate_policy_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "candidate_policy_assignments"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "current_candidate_policy_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "current_candidate_policy_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "current_candidate_policy_assignments"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT ON "candidate_policy_assignments" TO caselog_app;
GRANT SELECT, INSERT, UPDATE ON "current_candidate_policy_assignments" TO caselog_app;
GRANT EXECUTE ON FUNCTION "caselog"."reject_candidate_policy_assignment_update"() TO caselog_app;
