CREATE TYPE "gate_evaluation_result" AS ENUM ('passed', 'warning', 'failed', 'unknown');
CREATE TYPE "gate_evaluation_diagnostic" AS ENUM (
    'none', 'missing', 'incomplete', 'stale', 'untrusted'
);
CREATE TYPE "readiness_decision_status" AS ENUM ('ready', 'at_risk', 'blocked', 'unknown');
CREATE TYPE "readiness_evaluation_trigger" AS ENUM (
    'manual', 'evidence_changed', 'policy_assigned', 'reconciliation'
);
CREATE TYPE "readiness_projection_state" AS ENUM ('pending', 'current', 'stale', 'failed');

CREATE TABLE "readiness_decisions" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "evidence_revision" INTEGER NOT NULL,
    "evaluator_version" VARCHAR(20) NOT NULL,
    "trigger" "readiness_evaluation_trigger" NOT NULL,
    "status" "readiness_decision_status" NOT NULL,
    "evaluated_by_id" UUID,
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_readiness_decisions" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_readiness_decisions_org_project_candidate_id"
        UNIQUE ("organization_id", "project_id", "candidate_id", "id"),
    CONSTRAINT "uq_readiness_decisions_input"
        UNIQUE (
            "organization_id", "candidate_id", "policy_version_id",
            "evidence_revision", "evaluator_version"
        ),
    CONSTRAINT "chk_readiness_decisions_evidence_revision"
        CHECK ("evidence_revision" >= 0),
    CONSTRAINT "readiness_decisions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "readiness_decisions_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "readiness_decisions_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "readiness_decisions_assignment_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id", "assignment_id")
        REFERENCES "candidate_policy_assignments"(
            "organization_id", "project_id", "candidate_id", "id"
        ) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "readiness_decisions_policy_version_fkey"
        FOREIGN KEY ("organization_id", "project_id", "policy_version_id")
        REFERENCES "release_policy_versions"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "readiness_decisions_evaluated_by_id_fkey"
        FOREIGN KEY ("evaluated_by_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_readiness_decisions_org_project_candidate_time"
    ON "readiness_decisions"(
        "organization_id", "project_id", "candidate_id", "evaluated_at", "id"
    );

CREATE TABLE "gate_evaluations" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "gate_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "result" "gate_evaluation_result" NOT NULL,
    "diagnostic" "gate_evaluation_diagnostic" NOT NULL,
    "metric_key" VARCHAR(80) NOT NULL,
    "metric_version" VARCHAR(20) NOT NULL,
    "dimensions" JSONB NOT NULL,
    "operator" "readiness_gate_operator" NOT NULL,
    "expected_value_type" "evidence_value_type" NOT NULL,
    "expected_percentage" DECIMAL(12,9),
    "expected_integer" INTEGER,
    "actual_percentage" DECIMAL(12,9),
    "actual_integer" INTEGER,
    "selected_observation_id" UUID,
    "explanation_code" VARCHAR(60) NOT NULL,
    "evaluator_version" VARCHAR(20) NOT NULL,
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_gate_evaluations" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_gate_evaluations_decision_gate"
        UNIQUE ("organization_id", "decision_id", "gate_id"),
    CONSTRAINT "chk_gate_evaluations_position" CHECK ("position" >= 0),
    CONSTRAINT "chk_gate_evaluations_expected_value" CHECK (
        ("expected_value_type" = 'percentage' AND "expected_integer" IS NULL AND
            "expected_percentage" >= 0 AND "expected_percentage" <= 100) OR
        ("expected_value_type" = 'integer' AND "expected_percentage" IS NULL AND
            "expected_integer" >= 0)
    ),
    CONSTRAINT "chk_gate_evaluations_actual_value" CHECK (
        ("actual_percentage" IS NULL AND "actual_integer" IS NULL) OR
        ("expected_value_type" = 'percentage' AND "actual_integer" IS NULL AND
            "actual_percentage" >= 0 AND "actual_percentage" <= 100) OR
        ("expected_value_type" = 'integer' AND "actual_percentage" IS NULL AND
            "actual_integer" >= 0)
    ),
    CONSTRAINT "gate_evaluations_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gate_evaluations_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gate_evaluations_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gate_evaluations_decision_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id", "decision_id")
        REFERENCES "readiness_decisions"(
            "organization_id", "project_id", "candidate_id", "id"
        ) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gate_evaluations_policy_version_fkey"
        FOREIGN KEY ("organization_id", "project_id", "policy_version_id")
        REFERENCES "release_policy_versions"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gate_evaluations_gate_fkey"
        FOREIGN KEY ("organization_id", "gate_id")
        REFERENCES "readiness_gates"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "gate_evaluations_selected_observation_fkey"
        FOREIGN KEY ("organization_id", "candidate_id", "selected_observation_id")
        REFERENCES "evidence_observations"("organization_id", "candidate_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_gate_evaluations_org_candidate_decision_position"
    ON "gate_evaluations"(
        "organization_id", "project_id", "candidate_id", "decision_id", "position"
    );

CREATE TABLE "current_readiness_decisions" (
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "decision_id" UUID,
    "target_evidence_revision" INTEGER NOT NULL,
    "state" "readiness_projection_state" NOT NULL,
    "failure_code" VARCHAR(80),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_current_readiness_decisions"
        PRIMARY KEY ("organization_id", "candidate_id"),
    CONSTRAINT "uq_current_readiness_decisions_decision"
        UNIQUE ("organization_id", "decision_id"),
    CONSTRAINT "uq_current_readiness_org_project_candidate"
        UNIQUE ("organization_id", "project_id", "candidate_id"),
    CONSTRAINT "uq_current_readiness_org_candidate_decision"
        UNIQUE ("organization_id", "project_id", "candidate_id", "decision_id"),
    CONSTRAINT "chk_current_readiness_target_revision"
        CHECK ("target_evidence_revision" >= 0),
    CONSTRAINT "chk_current_readiness_state" CHECK (
        ("state" = 'current' AND "decision_id" IS NOT NULL AND "failure_code" IS NULL) OR
        ("state" = 'stale' AND "decision_id" IS NOT NULL AND "failure_code" IS NULL) OR
        ("state" = 'pending' AND "decision_id" IS NULL AND "failure_code" IS NULL) OR
        ("state" = 'failed' AND "failure_code" IS NOT NULL)
    ),
    CONSTRAINT "current_readiness_decisions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "current_readiness_decisions_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "current_readiness_decisions_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "current_readiness_decisions_assignment_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id", "assignment_id")
        REFERENCES "candidate_policy_assignments"(
            "organization_id", "project_id", "candidate_id", "id"
        ) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "current_readiness_decisions_decision_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id", "decision_id")
        REFERENCES "readiness_decisions"(
            "organization_id", "project_id", "candidate_id", "id"
        ) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_current_readiness_decisions_org_project_state_updated"
    ON "current_readiness_decisions"(
        "organization_id", "project_id", "state", "updated_at"
    );

CREATE FUNCTION "caselog"."reject_readiness_history_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'readiness decision history is immutable' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER "readiness_decisions_immutable"
BEFORE UPDATE ON "readiness_decisions"
FOR EACH ROW EXECUTE FUNCTION "caselog"."reject_readiness_history_update"();
CREATE TRIGGER "gate_evaluations_immutable"
BEFORE UPDATE ON "gate_evaluations"
FOR EACH ROW EXECUTE FUNCTION "caselog"."reject_readiness_history_update"();

ALTER TABLE "readiness_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "readiness_decisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "readiness_decisions"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "gate_evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gate_evaluations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "gate_evaluations"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "current_readiness_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "current_readiness_decisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "current_readiness_decisions"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT ON "readiness_decisions" TO caselog_app;
GRANT SELECT, INSERT ON "gate_evaluations" TO caselog_app;
GRANT SELECT, INSERT, UPDATE ON "current_readiness_decisions" TO caselog_app;
GRANT EXECUTE ON FUNCTION "caselog"."reject_readiness_history_update"() TO caselog_app;
