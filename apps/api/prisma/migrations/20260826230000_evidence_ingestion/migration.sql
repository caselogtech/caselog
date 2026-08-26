ALTER TYPE "api_token_scope" ADD VALUE IF NOT EXISTS 'evidence:write';

ALTER TABLE "evidence_observations"
    ADD COLUMN "request_hash" CHAR(64);

ALTER TABLE "evidence_observations"
    ADD CONSTRAINT "chk_evidence_observations_request_hash"
    CHECK ("request_hash" IS NULL OR "request_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "current_evidence_observations"
    ADD COLUMN "producer_id" UUID;

UPDATE "current_evidence_observations" AS current
SET "producer_id" = observation."producer_id"
FROM "evidence_observations" AS observation
WHERE observation."organization_id" = current."organization_id"
  AND observation."id" = current."observation_id";

ALTER TABLE "current_evidence_observations"
    ALTER COLUMN "producer_id" SET NOT NULL,
    DROP CONSTRAINT "pk_current_evidence_observations",
    ADD CONSTRAINT "pk_current_evidence_observations"
        PRIMARY KEY ("organization_id", "candidate_id", "producer_id", "metric_key", "dimensions_hash"),
    ADD CONSTRAINT "current_evidence_observations_producer_fkey"
        FOREIGN KEY ("organization_id", "producer_id")
        REFERENCES "evidence_producers"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
