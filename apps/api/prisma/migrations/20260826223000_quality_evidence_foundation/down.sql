DROP TABLE "current_evidence_observations";
DROP TABLE "candidate_evidence_revisions";
DROP TRIGGER "evidence_observations_immutable" ON "evidence_observations";
DROP FUNCTION "caselog"."prevent_evidence_observation_update"();
DROP TABLE "evidence_observations";
DROP TABLE "evidence_producers";

DROP TYPE "evidence_observation_state";
DROP TYPE "evidence_value_type";
DROP TYPE "evidence_trust_level";
