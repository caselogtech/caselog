CREATE TYPE "readiness_waiver_scope" AS ENUM ('decision', 'gate_evaluation');

ALTER TABLE "gate_evaluations"
    ADD CONSTRAINT "uq_gate_evaluations_org_decision_id"
    UNIQUE ("organization_id", "decision_id", "id");

CREATE TABLE "readiness_waivers" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "scope" "readiness_waiver_scope" NOT NULL,
    "gate_evaluation_id" UUID,
    "reason" VARCHAR(2000) NOT NULL,
    "external_approval_reference" VARCHAR(500),
    "expires_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_readiness_waivers" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_readiness_waivers_org_decision_id"
        UNIQUE ("organization_id", "project_id", "candidate_id", "decision_id", "id"),
    CONSTRAINT "chk_readiness_waivers_scope" CHECK (
        ("scope" = 'decision' AND "gate_evaluation_id" IS NULL) OR
        ("scope" = 'gate_evaluation' AND "gate_evaluation_id" IS NOT NULL)
    ),
    CONSTRAINT "chk_readiness_waivers_reason" CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "chk_readiness_waivers_external_reference" CHECK (
        "external_approval_reference" IS NULL OR
        length(btrim("external_approval_reference")) > 0
    ),
    CONSTRAINT "chk_readiness_waivers_expiry" CHECK (
        "expires_at" IS NULL OR "expires_at" > "created_at"
    ),
    CONSTRAINT "readiness_waivers_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "readiness_waivers_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "readiness_waivers_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "readiness_waivers_decision_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id", "decision_id")
        REFERENCES "readiness_decisions"(
            "organization_id", "project_id", "candidate_id", "id"
        ) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "readiness_waivers_gate_evaluation_fkey"
        FOREIGN KEY ("organization_id", "decision_id", "gate_evaluation_id")
        REFERENCES "gate_evaluations"("organization_id", "decision_id", "id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "readiness_waivers_created_by_id_fkey"
        FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_readiness_waivers_org_project_decision_time"
    ON "readiness_waivers"(
        "organization_id", "project_id", "decision_id", "created_at", "id"
    );
CREATE INDEX "idx_readiness_waivers_org_decision_active"
    ON "readiness_waivers"(
        "organization_id", "decision_id", "scope", "gate_evaluation_id", "expires_at"
    );

CREATE TABLE "readiness_waiver_revocations" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "waiver_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "revoked_by_id" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_readiness_waiver_revocations" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_readiness_waiver_revocations_waiver"
        UNIQUE ("organization_id", "waiver_id"),
    CONSTRAINT "uq_readiness_waiver_revocations_org_decision_waiver"
        UNIQUE ("organization_id", "project_id", "candidate_id", "decision_id", "waiver_id"),
    CONSTRAINT "chk_readiness_waiver_revocations_reason"
        CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "readiness_waiver_revocations_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "readiness_waiver_revocations_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "readiness_waiver_revocations_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "readiness_waiver_revocations_decision_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id", "decision_id")
        REFERENCES "readiness_decisions"(
            "organization_id", "project_id", "candidate_id", "id"
        ) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "readiness_waiver_revocations_waiver_fkey"
        FOREIGN KEY (
            "organization_id", "project_id", "candidate_id", "decision_id", "waiver_id"
        ) REFERENCES "readiness_waivers"(
            "organization_id", "project_id", "candidate_id", "decision_id", "id"
        ) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "readiness_waiver_revocations_revoked_by_id_fkey"
        FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_readiness_waiver_revocations_org_decision_time"
    ON "readiness_waiver_revocations"(
        "organization_id", "project_id", "decision_id", "revoked_at", "id"
    );

CREATE FUNCTION "caselog"."reject_readiness_waiver_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'readiness waiver history is immutable' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER "readiness_waivers_immutable"
BEFORE UPDATE ON "readiness_waivers"
FOR EACH ROW EXECUTE FUNCTION "caselog"."reject_readiness_waiver_update"();
CREATE TRIGGER "readiness_waiver_revocations_immutable"
BEFORE UPDATE ON "readiness_waiver_revocations"
FOR EACH ROW EXECUTE FUNCTION "caselog"."reject_readiness_waiver_update"();

ALTER TABLE "readiness_waivers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "readiness_waivers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "readiness_waivers"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "readiness_waiver_revocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "readiness_waiver_revocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "readiness_waiver_revocations"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT ON "readiness_waivers" TO caselog_app;
GRANT SELECT, INSERT ON "readiness_waiver_revocations" TO caselog_app;
REVOKE ALL ON FUNCTION "caselog"."reject_readiness_waiver_update"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "caselog"."reject_readiness_waiver_update"() FROM caselog_app;
