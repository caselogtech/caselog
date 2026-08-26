CREATE TYPE "evidence_trust_level" AS ENUM ('verified', 'authenticated', 'unverified');
CREATE TYPE "evidence_value_type" AS ENUM ('percentage', 'integer');
CREATE TYPE "evidence_observation_state" AS ENUM ('available', 'incomplete');

CREATE TABLE "evidence_producers" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "producer_type" VARCHAR(80) NOT NULL,
    "producer_key" VARCHAR(120) NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "trust_level" "evidence_trust_level" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_evidence_producers" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_evidence_producers_org_type_key"
        UNIQUE ("organization_id", "producer_type", "producer_key"),
    CONSTRAINT "chk_evidence_producers_schema_version" CHECK ("schema_version" > 0),
    CONSTRAINT "evidence_producers_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "evidence_observations" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "metric_key" VARCHAR(80) NOT NULL,
    "metric_version" VARCHAR(20) NOT NULL,
    "producer_id" UUID NOT NULL,
    "producer_schema_version" INTEGER NOT NULL,
    "value_type" "evidence_value_type" NOT NULL,
    "state" "evidence_observation_state" NOT NULL,
    "percentage_value" DECIMAL(12,9),
    "integer_value" INTEGER,
    "dimensions" JSONB NOT NULL,
    "dimensions_hash" CHAR(64) NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "trust_level" "evidence_trust_level" NOT NULL,
    "source_type" VARCHAR(80) NOT NULL,
    "source_id" VARCHAR(200) NOT NULL,
    "source_revision" VARCHAR(200) NOT NULL,
    "source_url" VARCHAR(2048),
    "idempotency_key" VARCHAR(200) NOT NULL,
    "supersedes_observation_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_evidence_observations" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_evidence_observations_org_candidate_id"
        UNIQUE ("organization_id", "candidate_id", "id"),
    CONSTRAINT "uq_evidence_observations_producer_idempotency"
        UNIQUE ("organization_id", "producer_id", "idempotency_key"),
    CONSTRAINT "uq_evidence_observations_supersedes"
        UNIQUE ("organization_id", "supersedes_observation_id"),
    CONSTRAINT "chk_evidence_observations_producer_schema_version"
        CHECK ("producer_schema_version" > 0),
    CONSTRAINT "chk_evidence_observations_dimensions_object"
        CHECK (jsonb_typeof("dimensions") = 'object'),
    CONSTRAINT "chk_evidence_observations_payload_object"
        CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "chk_evidence_observations_expiry"
        CHECK ("expires_at" IS NULL OR "expires_at" > "observed_at"),
    CONSTRAINT "chk_evidence_observations_not_self_superseding"
        CHECK ("supersedes_observation_id" IS NULL OR "supersedes_observation_id" <> "id"),
    CONSTRAINT "chk_evidence_observations_typed_value" CHECK (
        ("value_type" = 'percentage' AND "integer_value" IS NULL AND
            ("percentage_value" IS NULL OR
                ("percentage_value" >= 0 AND "percentage_value" <= 100))) OR
        ("value_type" = 'integer' AND "percentage_value" IS NULL)
    ),
    CONSTRAINT "chk_evidence_observations_available_value" CHECK (
        "state" = 'incomplete' OR
        ("value_type" = 'percentage' AND "percentage_value" IS NOT NULL) OR
        ("value_type" = 'integer' AND "integer_value" IS NOT NULL)
    ),
    CONSTRAINT "evidence_observations_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "evidence_observations_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "evidence_observations_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "evidence_observations_producer_fkey"
        FOREIGN KEY ("organization_id", "producer_id")
        REFERENCES "evidence_producers"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "evidence_observations_supersedes_fkey"
        FOREIGN KEY ("organization_id", "supersedes_observation_id")
        REFERENCES "evidence_observations"("organization_id", "id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_evidence_observations_org_project_candidate_created"
    ON "evidence_observations"("organization_id", "project_id", "candidate_id", "created_at", "id");
CREATE INDEX "idx_evidence_observations_org_candidate_metric_dimensions"
    ON "evidence_observations"("organization_id", "candidate_id", "metric_key", "dimensions_hash", "created_at");

CREATE TABLE "candidate_evidence_revisions" (
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_candidate_evidence_revisions" PRIMARY KEY ("organization_id", "candidate_id"),
    CONSTRAINT "uq_candidate_evidence_revisions_org_project_candidate"
        UNIQUE ("organization_id", "project_id", "candidate_id"),
    CONSTRAINT "chk_candidate_evidence_revisions_revision" CHECK ("revision" >= 0),
    CONSTRAINT "candidate_evidence_revisions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "candidate_evidence_revisions_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "candidate_evidence_revisions_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "current_evidence_observations" (
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "metric_key" VARCHAR(80) NOT NULL,
    "dimensions_hash" CHAR(64) NOT NULL,
    "observation_id" UUID NOT NULL,
    "evidence_revision" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_current_evidence_observations"
        PRIMARY KEY ("organization_id", "candidate_id", "metric_key", "dimensions_hash"),
    CONSTRAINT "uq_current_evidence_observations_observation"
        UNIQUE ("organization_id", "observation_id"),
    CONSTRAINT "uq_current_evidence_org_candidate_observation"
        UNIQUE ("organization_id", "candidate_id", "observation_id"),
    CONSTRAINT "chk_current_evidence_observations_revision" CHECK ("evidence_revision" > 0),
    CONSTRAINT "current_evidence_observations_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "current_evidence_observations_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "current_evidence_observations_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "current_evidence_observations_observation_fkey"
        FOREIGN KEY ("organization_id", "candidate_id", "observation_id")
        REFERENCES "evidence_observations"("organization_id", "candidate_id", "id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_current_evidence_org_project_candidate_revision"
    ON "current_evidence_observations"("organization_id", "project_id", "candidate_id", "evidence_revision");

CREATE FUNCTION "caselog"."prevent_evidence_observation_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'evidence observations are immutable' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER "evidence_observations_immutable"
BEFORE UPDATE ON "evidence_observations"
FOR EACH ROW EXECUTE FUNCTION "caselog"."prevent_evidence_observation_update"();

ALTER TABLE "evidence_producers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence_producers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "evidence_producers"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "evidence_observations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence_observations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "evidence_observations"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "candidate_evidence_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "candidate_evidence_revisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "candidate_evidence_revisions"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "current_evidence_observations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "current_evidence_observations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "current_evidence_observations"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT, UPDATE ON "evidence_producers" TO caselog_app;
GRANT SELECT, INSERT ON "evidence_observations" TO caselog_app;
GRANT SELECT, INSERT, UPDATE ON "candidate_evidence_revisions" TO caselog_app;
GRANT SELECT, INSERT, UPDATE ON "current_evidence_observations" TO caselog_app;
GRANT EXECUTE ON FUNCTION "caselog"."prevent_evidence_observation_update"() TO caselog_app;
