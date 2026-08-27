ALTER TABLE "current_readiness_decisions"
    ADD COLUMN "target_evaluator_version" VARCHAR(20);

UPDATE "current_readiness_decisions" AS current
SET "target_evaluator_version" = COALESCE(decision."evaluator_version", '1.0.0')
FROM "readiness_decisions" AS decision
WHERE decision."organization_id" = current."organization_id"
  AND decision."id" = current."decision_id";

UPDATE "current_readiness_decisions"
SET "target_evaluator_version" = '1.0.0'
WHERE "target_evaluator_version" IS NULL;

ALTER TABLE "current_readiness_decisions"
    ALTER COLUMN "target_evaluator_version" SET NOT NULL;
