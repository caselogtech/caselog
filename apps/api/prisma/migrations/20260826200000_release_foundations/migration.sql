CREATE TYPE "environment_state" AS ENUM ('active', 'archived');
CREATE TYPE "release_state" AS ENUM ('draft', 'active', 'released', 'cancelled');
CREATE TYPE "candidate_test_run_role" AS ENUM ('required', 'informational');

ALTER TABLE "test_runs"
    ADD CONSTRAINT "uq_test_runs_organization_project_id"
    UNIQUE ("organization_id", "project_id", "id");

CREATE TABLE "environments" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "state" "environment_state" NOT NULL DEFAULT 'active',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_environments" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_environments_organization_project_id"
        UNIQUE ("organization_id", "project_id", "id"),
    CONSTRAINT "uq_environments_organization_project_slug"
        UNIQUE ("organization_id", "project_id", "slug"),
    CONSTRAINT "environments_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "environments_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "environments_created_by_id_fkey"
        FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_environments_org_project_state_created"
    ON "environments"("organization_id", "project_id", "state", "created_at");

CREATE TABLE "releases" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "environment_id" UUID,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "state" "release_state" NOT NULL DEFAULT 'draft',
    "target_date" TIMESTAMPTZ(3),
    "external_reference" VARCHAR(2048),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_releases" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_releases_organization_project_id"
        UNIQUE ("organization_id", "project_id", "id"),
    CONSTRAINT "uq_releases_organization_project_key"
        UNIQUE ("organization_id", "project_id", "key"),
    CONSTRAINT "chk_releases_lifecycle_timestamps" CHECK (
        ("state" <> 'draft' OR ("activated_at" IS NULL AND "released_at" IS NULL AND "cancelled_at" IS NULL)) AND
        ("state" <> 'active' OR ("activated_at" IS NOT NULL AND "released_at" IS NULL AND "cancelled_at" IS NULL)) AND
        ("state" <> 'released' OR ("activated_at" IS NOT NULL AND "released_at" IS NOT NULL AND "cancelled_at" IS NULL)) AND
        ("state" <> 'cancelled' OR ("released_at" IS NULL AND "cancelled_at" IS NOT NULL))
    ),
    CONSTRAINT "releases_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "releases_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "releases_environment_fkey"
        FOREIGN KEY ("organization_id", "project_id", "environment_id")
        REFERENCES "environments"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "releases_created_by_id_fkey"
        FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_releases_org_project_state_created"
    ON "releases"("organization_id", "project_id", "state", "created_at");

CREATE TABLE "release_candidates" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "source_revision" VARCHAR(255),
    "build_identifier" VARCHAR(255),
    "artifact_digest" VARCHAR(255),
    "branch" VARCHAR(255),
    "version" VARCHAR(120),
    "source_url" VARCHAR(2048),
    "identity_hash" CHAR(64) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_release_candidates" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "uq_release_candidates_organization_project_id"
        UNIQUE ("organization_id", "project_id", "id"),
    CONSTRAINT "uq_release_candidates_organization_project_identity"
        UNIQUE ("organization_id", "project_id", "identity_hash"),
    CONSTRAINT "uq_release_candidates_organization_release_sequence"
        UNIQUE ("organization_id", "release_id", "sequence"),
    CONSTRAINT "chk_release_candidates_sequence" CHECK ("sequence" > 0),
    CONSTRAINT "chk_release_candidates_stable_identity" CHECK (
        "source_revision" IS NOT NULL OR
        "build_identifier" IS NOT NULL OR
        "artifact_digest" IS NOT NULL
    ),
    CONSTRAINT "release_candidates_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "release_candidates_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "release_candidates_release_fkey"
        FOREIGN KEY ("organization_id", "project_id", "release_id")
        REFERENCES "releases"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "release_candidates_created_by_id_fkey"
        FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_release_candidates_org_release_created"
    ON "release_candidates"("organization_id", "release_id", "created_at");

CREATE FUNCTION "caselog"."prevent_release_candidate_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'release candidates are immutable' USING ERRCODE = '23000';
END;
$$;

CREATE TRIGGER "release_candidates_immutable"
BEFORE UPDATE ON "release_candidates"
FOR EACH ROW EXECUTE FUNCTION "caselog"."prevent_release_candidate_update"();

CREATE TABLE "candidate_test_runs" (
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "test_run_id" UUID NOT NULL,
    "role" "candidate_test_run_role" NOT NULL DEFAULT 'required',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_candidate_test_runs"
        PRIMARY KEY ("organization_id", "candidate_id", "test_run_id"),
    CONSTRAINT "uq_candidate_test_runs_organization_test_run"
        UNIQUE ("organization_id", "test_run_id"),
    CONSTRAINT "uq_candidate_test_runs_org_project_run"
        UNIQUE ("organization_id", "project_id", "test_run_id"),
    CONSTRAINT "candidate_test_runs_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "candidate_test_runs_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "candidate_test_runs_candidate_fkey"
        FOREIGN KEY ("organization_id", "project_id", "candidate_id")
        REFERENCES "release_candidates"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "candidate_test_runs_test_run_fkey"
        FOREIGN KEY ("organization_id", "project_id", "test_run_id")
        REFERENCES "test_runs"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "candidate_test_runs_created_by_id_fkey"
        FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_candidate_test_runs_org_candidate_created"
    ON "candidate_test_runs"("organization_id", "candidate_id", "created_at");

CREATE TABLE "release_lifecycle_events" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "from_state" "release_state",
    "to_state" "release_state" NOT NULL,
    "actor_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_release_lifecycle_events" PRIMARY KEY ("organization_id", "id"),
    CONSTRAINT "release_lifecycle_events_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "release_lifecycle_events_project_fkey"
        FOREIGN KEY ("organization_id", "project_id")
        REFERENCES "projects"("organization_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "release_lifecycle_events_release_fkey"
        FOREIGN KEY ("organization_id", "project_id", "release_id")
        REFERENCES "releases"("organization_id", "project_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "release_lifecycle_events_actor_id_fkey"
        FOREIGN KEY ("actor_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_release_lifecycle_events_org_release_time"
    ON "release_lifecycle_events"("organization_id", "release_id", "occurred_at", "id");

ALTER TABLE "environments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "environments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "environments"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "releases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "releases" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "releases"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "release_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "release_candidates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "release_candidates"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "candidate_test_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "candidate_test_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "candidate_test_runs"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

ALTER TABLE "release_lifecycle_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "release_lifecycle_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "release_lifecycle_events"
    USING ("organization_id" = "caselog"."current_organization_id"())
    WITH CHECK ("organization_id" = "caselog"."current_organization_id"());

GRANT SELECT, INSERT, UPDATE, DELETE ON "environments" TO caselog_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "releases" TO caselog_app;
GRANT SELECT, INSERT ON "release_candidates" TO caselog_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "candidate_test_runs" TO caselog_app;
GRANT SELECT, INSERT ON "release_lifecycle_events" TO caselog_app;
GRANT EXECUTE ON FUNCTION "caselog"."prevent_release_candidate_update"() TO caselog_app;
