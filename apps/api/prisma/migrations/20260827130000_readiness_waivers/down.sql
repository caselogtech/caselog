DROP TRIGGER "readiness_waiver_revocations_immutable" ON "readiness_waiver_revocations";
DROP TRIGGER "readiness_waivers_immutable" ON "readiness_waivers";
DROP FUNCTION "caselog"."reject_readiness_waiver_update"();
DROP TABLE "readiness_waiver_revocations";
DROP TABLE "readiness_waivers";
ALTER TABLE "gate_evaluations"
    DROP CONSTRAINT "uq_gate_evaluations_org_decision_id";
DROP TYPE "readiness_waiver_scope";
