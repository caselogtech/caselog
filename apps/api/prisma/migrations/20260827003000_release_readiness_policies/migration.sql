CREATE TYPE "release_policy_version_state" AS ENUM ('draft', 'published', 'retired');
CREATE TYPE "readiness_gate_operator" AS ENUM ('eq', 'ne', 'gt', 'gte', 'lt', 'lte');
CREATE TYPE "readiness_gate_impact" AS ENUM ('warning', 'blocking');
CREATE TYPE "readiness_evidence_behavior" AS ENUM ('unknown', 'warn', 'block');

CREATE TABLE "release_policies" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_release_policies" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_release_policies_org_project_id"
        UNIQUE ("organization_id", "project_id", "id"),
    CONSTRAINT "uq_release_policies_org_project_key"
        UNIQUE ("organization_id", "project_id", "key"),
    CONSTRAINT "chk_release_policies_key"
        CHECK ("key" ~ '^[a-z][a-z0-9-]{1,49}$'),
    CONSTRAINT "release_policies_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "release_policies_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "release_policies_created_by_id_fkey"
        FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_release_policies_org_project_created"
    ON "release_policies"("organization_id", "project_id", "created_at", "id");

CREATE TABLE "release_policy_versions" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "state" "release_policy_version_state" NOT NULL DEFAULT 'draft',
    "created_by_id" UUID,
    "published_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "retired_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_release_policy_versions" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_release_policy_versions_org_project_id"
        UNIQUE ("organization_id", "project_id", "id"),
    CONSTRAINT "uq_release_policy_versions_org_policy_version"
        UNIQUE ("organization_id", "policy_id", "version"),
    CONSTRAINT "chk_release_policy_versions_version" CHECK ("version" > 0),
    CONSTRAINT "chk_release_policy_versions_state_timestamps" CHECK (
        ("state" = 'draft' AND "published_at" IS NULL AND "retired_at" IS NULL) OR
        ("state" = 'published' AND "published_at" IS NOT NULL AND "retired_at" IS NULL) OR
        ("state" = 'retired' AND "published_at" IS NOT NULL AND "retired_at" IS NOT NULL)
    ),
    CONSTRAINT "release_policy_versions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "release_policy_versions_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "release_policy_versions_policy_fkey"
        FOREIGN KEY ("organization_id", "project_id", "policy_id")
        REFERENCES "release_policies"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "release_policy_versions_created_by_id_fkey"
        FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "release_policy_versions_published_by_id_fkey"
        FOREIGN KEY ("published_by_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_release_policy_versions_one_draft"
    ON "release_policy_versions"("organization_id", "policy_id")
    WHERE "state" = 'draft';
CREATE UNIQUE INDEX "uq_release_policy_versions_one_published"
    ON "release_policy_versions"("organization_id", "policy_id")
    WHERE "state" = 'published';
CREATE INDEX "idx_release_policy_versions_org_project_policy_created"
    ON "release_policy_versions"("organization_id", "project_id", "policy_id", "created_at");

CREATE TABLE "readiness_gates" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "position" INTEGER NOT NULL,
    "metric_key" VARCHAR(80) NOT NULL,
    "metric_version" VARCHAR(20) NOT NULL,
    "test_run_role" "candidate_test_run_role" NOT NULL,
    "operator" "readiness_gate_operator" NOT NULL,
    "expected_value_type" "evidence_value_type" NOT NULL,
    "expected_percentage" DECIMAL(12,9),
    "expected_integer" INTEGER,
    "impact" "readiness_gate_impact" NOT NULL,
    "missing_evidence_behavior" "readiness_evidence_behavior" NOT NULL,
    "stale_evidence_behavior" "readiness_evidence_behavior" NOT NULL,
    "minimum_trust" "evidence_trust_level" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_readiness_gates" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_readiness_gates_org_version_key"
        UNIQUE ("organization_id", "policy_version_id", "key"),
    CONSTRAINT "uq_readiness_gates_org_version_position"
        UNIQUE ("organization_id", "policy_version_id", "position"),
    CONSTRAINT "chk_readiness_gates_key"
        CHECK ("key" ~ '^[a-z][a-z0-9_.-]{1,49}$'),
    CONSTRAINT "chk_readiness_gates_position" CHECK ("position" >= 0),
    CONSTRAINT "chk_readiness_gates_expected_value" CHECK (
        ("expected_value_type" = 'percentage' AND "expected_integer" IS NULL AND
            "expected_percentage" >= 0 AND "expected_percentage" <= 100) OR
        ("expected_value_type" = 'integer' AND "expected_percentage" IS NULL AND
            "expected_integer" >= 0)
    ),
    CONSTRAINT "chk_readiness_gates_metric_contract" CHECK (
        ("metric_key" IN ('test.pass_rate', 'test.completion_rate') AND
            "metric_version" = '1.0.0' AND "expected_value_type" = 'percentage') OR
        ("metric_key" = 'test.failed_count' AND
            "metric_version" = '1.0.0' AND "expected_value_type" = 'integer')
    ),
    CONSTRAINT "readiness_gates_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "readiness_gates_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "readiness_gates_policy_version_fkey"
        FOREIGN KEY ("organization_id", "project_id", "policy_version_id")
        REFERENCES "release_policy_versions"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_readiness_gates_org_project_version_position"
    ON "readiness_gates"("organization_id", "project_id", "policy_version_id", "position");

CREATE FUNCTION "caselog"."guard_release_policy_version_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF ROW(NEW."organization_id", NEW."id", NEW."project_id", NEW."policy_id", NEW."version",
           NEW."created_by_id", NEW."created_at") IS DISTINCT FROM
       ROW(OLD."organization_id", OLD."id", OLD."project_id", OLD."policy_id", OLD."version",
           OLD."created_by_id", OLD."created_at") THEN
        RAISE EXCEPTION 'release policy version identity is immutable' USING ERRCODE = '23000';
    END IF;

    IF OLD."state" = 'draft' AND NEW."state" = 'published' THEN
        RETURN NEW;
    END IF;
    IF OLD."state" = 'published' AND NEW."state" = 'retired' THEN
        IF ROW(NEW."published_by_id", NEW."published_at") IS DISTINCT FROM
           ROW(OLD."published_by_id", OLD."published_at") THEN
            RAISE EXCEPTION 'published release policy provenance is immutable' USING ERRCODE = '23000';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW IS NOT DISTINCT FROM OLD THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'invalid release policy version transition' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER "release_policy_versions_guard_update"
BEFORE UPDATE ON "release_policy_versions"
FOR EACH ROW EXECUTE FUNCTION "caselog"."guard_release_policy_version_update"();

CREATE FUNCTION "caselog"."guard_readiness_gate_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    version_state "release_policy_version_state";
BEGIN
    SELECT "state" INTO version_state
    FROM "release_policy_versions"
    WHERE "organization_id" = COALESCE(NEW."organization_id", OLD."organization_id")
      AND "id" = COALESCE(NEW."policy_version_id", OLD."policy_version_id");
    IF version_state IS DISTINCT FROM 'draft'::"release_policy_version_state" THEN
        RAISE EXCEPTION 'published readiness gates are immutable' USING ERRCODE = '23000';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "readiness_gates_guard_update"
BEFORE UPDATE OR DELETE ON "readiness_gates"
FOR EACH ROW EXECUTE FUNCTION "caselog"."guard_readiness_gate_mutation"();

ALTER TABLE "release_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "release_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "release_policies"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "release_policy_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "release_policy_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "release_policy_versions"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "readiness_gates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "readiness_gates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "readiness_gates"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT, UPDATE ON "release_policies" TO caselog_app;
GRANT SELECT, INSERT, UPDATE ON "release_policy_versions" TO caselog_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "readiness_gates" TO caselog_app;
GRANT EXECUTE ON FUNCTION "caselog"."guard_release_policy_version_update"() TO caselog_app;
GRANT EXECUTE ON FUNCTION "caselog"."guard_readiness_gate_mutation"() TO caselog_app;
