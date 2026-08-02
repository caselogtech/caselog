-- Extensions used by global identity fields and tenant-aware JSONB indexes.
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- The login role is provisioned by the deployment. The migration creates a
-- non-login fallback so grants and RLS are identical in shadow databases.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'caselog_app') THEN
        CREATE ROLE caselog_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END
$$;

-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('owner', 'admin', 'lead', 'tester', 'contributor', 'read_only');

-- CreateEnum
CREATE TYPE "case_template" AS ENUM ('steps', 'text', 'exploratory', 'bdd');

-- CreateEnum
CREATE TYPE "run_status" AS ENUM ('draft', 'active', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "custom_field_type" AS ENUM ('text', 'select', 'multiselect', 'number', 'date', 'user', 'url', 'checkbox');

-- CreateEnum
CREATE TYPE "custom_field_entity_type" AS ENUM ('case', 'run', 'result', 'defect_link', 'milestone');

-- CreateEnum
CREATE TYPE "attachment_target_type" AS ENUM ('case_version', 'result');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role" "membership_role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_memberships" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "projects" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(12) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "next_case_number" BIGINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_projects" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "suites" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_suites" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "sections" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "suite_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_sections" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "suite_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "case_number" BIGINT NOT NULL,
    "current_version_id" UUID,
    "automation_id" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_test_cases" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "test_case_versions" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "test_case_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "template" "case_template" NOT NULL DEFAULT 'steps',
    "preconditions" TEXT,
    "expected_result" TEXT,
    "content" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_test_case_versions" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "result_statuses" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "icon" VARCHAR(50) NOT NULL,
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "counts_as_failure" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_result_statuses" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "test_runs" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "run_status" NOT NULL DEFAULT 'draft',
    "build" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_test_runs" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "test_run_items" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "test_run_id" UUID NOT NULL,
    "case_version_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "assignee_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pk_test_run_items" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "test_results" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "test_run_item_id" UUID NOT NULL,
    "status_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "comment" TEXT,
    "elapsed_ms" INTEGER,
    "executed_by_id" UUID,
    "executed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "build" VARCHAR(200),

    CONSTRAINT "pk_test_results" PRIMARY KEY ("organization_id","id","executed_at")
) PARTITION BY RANGE ("executed_at");

-- New monthly partitions are created ahead of time by operations. The default
-- partition keeps ingestion available if a scheduled partition is missing.
CREATE TABLE "test_results_2026_08" PARTITION OF "test_results"
    FOR VALUES FROM ('2026-08-01T00:00:00Z') TO ('2026-09-01T00:00:00Z');
CREATE TABLE "test_results_2026_09" PARTITION OF "test_results"
    FOR VALUES FROM ('2026-09-01T00:00:00Z') TO ('2026-10-01T00:00:00Z');
CREATE TABLE "test_results_default" PARTITION OF "test_results" DEFAULT;

-- CreateTable
CREATE TABLE "attachments" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "target_type" "attachment_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(255) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_attachments" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "entity_type" "custom_field_entity_type" NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "field_type" "custom_field_type" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "pk_custom_field_definitions" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "organization_id" UUID NOT NULL,
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "definition_id" UUID NOT NULL,
    "entity_type" "custom_field_entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pk_custom_field_values" PRIMARY KEY ("organization_id","id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "organization_id" UUID NOT NULL,
    "storage_bytes_used" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pk_usage_counters" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_organizations_slug" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_memberships_organization_id_role" ON "memberships"("organization_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "uq_memberships_organization_id_user_id" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_projects_organization_id_deleted_at" ON "projects"("organization_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_projects_organization_id_key" ON "projects"("organization_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_projects_organization_id_slug" ON "projects"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "idx_suites_organization_id_project_id_position" ON "suites"("organization_id", "project_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "uq_suites_organization_id_project_id_name" ON "suites"("organization_id", "project_id", "name");

-- CreateIndex
CREATE INDEX "idx_sections_org_project_suite_parent_position" ON "sections"("organization_id", "project_id", "suite_id", "parent_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sections_organization_id_suite_id_path" ON "sections"("organization_id", "suite_id", "path");

-- CreateIndex
CREATE INDEX "idx_test_cases_organization_id_project_id_section_id_deleted_at" ON "test_cases"("organization_id", "project_id", "section_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_test_cases_organization_id_project_id_automation_id" ON "test_cases"("organization_id", "project_id", "automation_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_test_cases_organization_id_project_id_case_number" ON "test_cases"("organization_id", "project_id", "case_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_test_cases_organization_id_current_version_id" ON "test_cases"("organization_id", "current_version_id");

-- CreateIndex
CREATE INDEX "idx_test_case_versions_organization_id_created_at" ON "test_case_versions"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_test_case_versions_organization_id_test_case_id_version" ON "test_case_versions"("organization_id", "test_case_id", "version");

-- CreateIndex
CREATE INDEX "idx_result_statuses_organization_id_project_id_position" ON "result_statuses"("organization_id", "project_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "uq_result_statuses_organization_id_project_id_key" ON "result_statuses"("organization_id", "project_id", "key");

-- CreateIndex
CREATE INDEX "idx_test_runs_organization_id_project_id_status_created_at" ON "test_runs"("organization_id", "project_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "idx_test_run_items_organization_id_test_run_id_position" ON "test_run_items"("organization_id", "test_run_id", "position");

-- CreateIndex
CREATE INDEX "idx_test_run_items_organization_id_assignee_id_status_id" ON "test_run_items"("organization_id", "assignee_id", "status_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_test_run_items_organization_id_test_run_id_case_version_id" ON "test_run_items"("organization_id", "test_run_id", "case_version_id");

-- CreateIndex
CREATE INDEX "idx_test_results_organization_id_test_run_item_id_executed_at" ON "test_results"("organization_id", "test_run_item_id", "executed_at");

-- CreateIndex
CREATE INDEX "idx_test_results_organization_id_status_id_executed_at" ON "test_results"("organization_id", "status_id", "executed_at");

-- CreateIndex
CREATE INDEX "idx_attachments_organization_id_target_type_target_id" ON "attachments"("organization_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "idx_attachments_organization_id_checksum_sha256" ON "attachments"("organization_id", "checksum_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "uq_attachments_organization_id_storage_key" ON "attachments"("organization_id", "storage_key");

-- CreateIndex
CREATE INDEX "idx_custom_field_defs_org_project_entity_position" ON "custom_field_definitions"("organization_id", "project_id", "entity_type", "position");

-- CreateIndex
CREATE UNIQUE INDEX "uq_custom_field_defs_org_project_entity_key" ON "custom_field_definitions"("organization_id", "project_id", "entity_type", "key");

-- CreateIndex
CREATE INDEX "idx_custom_field_values_organization_id_entity_type_entity_id" ON "custom_field_values"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_custom_field_values_organization_id_definition_id_entity_id" ON "custom_field_values"("organization_id", "definition_id", "entity_id");

-- Prisma cannot currently express a tenant-leading multicolumn GIN index.
CREATE INDEX "idx_custom_field_values_organization_id_value"
ON "custom_field_values" USING GIN ("organization_id", "value" jsonb_path_ops);

-- Database-level invariants that Prisma Schema cannot express yet.
ALTER TABLE "organizations"
    ADD CONSTRAINT "chk_organizations_slug" CHECK ("slug" ~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$');
ALTER TABLE "projects"
    ADD CONSTRAINT "chk_projects_key" CHECK ("key" ~ '^[A-Z][A-Z0-9_]{1,11}$'),
    ADD CONSTRAINT "chk_projects_next_case_number" CHECK ("next_case_number" > 0);
ALTER TABLE "sections"
    ADD CONSTRAINT "chk_sections_depth" CHECK ("depth" >= 0),
    ADD CONSTRAINT "chk_sections_path" CHECK (length("path") > 0);
ALTER TABLE "test_cases"
    ADD CONSTRAINT "chk_test_cases_case_number" CHECK ("case_number" > 0);
ALTER TABLE "test_case_versions"
    ADD CONSTRAINT "chk_test_case_versions_version" CHECK ("version" > 0);
ALTER TABLE "result_statuses"
    ADD CONSTRAINT "chk_result_statuses_color" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE "test_results"
    ADD CONSTRAINT "chk_test_results_attempt" CHECK ("attempt" > 0),
    ADD CONSTRAINT "chk_test_results_elapsed_ms" CHECK ("elapsed_ms" IS NULL OR "elapsed_ms" >= 0);
ALTER TABLE "attachments"
    ADD CONSTRAINT "chk_attachments_size_bytes" CHECK ("size_bytes" >= 0),
    ADD CONSTRAINT "chk_attachments_checksum_sha256" CHECK ("checksum_sha256" ~ '^[0-9A-Fa-f]{64}$');
ALTER TABLE "usage_counters"
    ADD CONSTRAINT "chk_usage_counters_storage_bytes_used" CHECK ("storage_bytes_used" >= 0);

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suites" ADD CONSTRAINT "suites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suites" ADD CONSTRAINT "suites_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_organization_id_suite_id_fkey" FOREIGN KEY ("organization_id", "suite_id") REFERENCES "suites"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_organization_id_parent_id_fkey" FOREIGN KEY ("organization_id", "parent_id") REFERENCES "sections"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_organization_id_suite_id_fkey" FOREIGN KEY ("organization_id", "suite_id") REFERENCES "suites"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_organization_id_section_id_fkey" FOREIGN KEY ("organization_id", "section_id") REFERENCES "sections"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_organization_id_current_version_id_fkey" FOREIGN KEY ("organization_id", "current_version_id") REFERENCES "test_case_versions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_organization_id_test_case_id_fkey" FOREIGN KEY ("organization_id", "test_case_id") REFERENCES "test_cases"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_statuses" ADD CONSTRAINT "result_statuses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_statuses" ADD CONSTRAINT "result_statuses_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_items" ADD CONSTRAINT "test_run_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_items" ADD CONSTRAINT "test_run_items_organization_id_test_run_id_fkey" FOREIGN KEY ("organization_id", "test_run_id") REFERENCES "test_runs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_items" ADD CONSTRAINT "test_run_items_organization_id_case_version_id_fkey" FOREIGN KEY ("organization_id", "case_version_id") REFERENCES "test_case_versions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_items" ADD CONSTRAINT "test_run_items_organization_id_status_id_fkey" FOREIGN KEY ("organization_id", "status_id") REFERENCES "result_statuses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_run_items" ADD CONSTRAINT "test_run_items_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_organization_id_test_run_item_id_fkey" FOREIGN KEY ("organization_id", "test_run_item_id") REFERENCES "test_run_items"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_organization_id_status_id_fkey" FOREIGN KEY ("organization_id", "status_id") REFERENCES "result_statuses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_executed_by_id_fkey" FOREIGN KEY ("executed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "projects"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_organization_id_definition_id_fkey" FOREIGN KEY ("organization_id", "definition_id") REFERENCES "custom_field_definitions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant context is transaction-local. An unset context resolves to NULL and
-- therefore exposes no tenant-owned rows.
CREATE SCHEMA "caselog";
REVOKE ALL ON SCHEMA "caselog" FROM PUBLIC;

CREATE FUNCTION "caselog"."current_organization_id"() RETURNS UUID
LANGUAGE SQL
STABLE
PARALLEL SAFE
AS $$
    SELECT NULLIF(current_setting('caselog.organization_id', true), '')::UUID
$$;

GRANT USAGE ON SCHEMA "caselog" TO caselog_app;
GRANT EXECUTE ON FUNCTION "caselog"."current_organization_id"() TO caselog_app;

-- All tenant-owned tables are deny-by-default and share the same policy.
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'memberships',
        'projects',
        'suites',
        'sections',
        'test_cases',
        'test_case_versions',
        'result_statuses',
        'test_runs',
        'test_run_items',
        'test_results',
        'test_results_2026_08',
        'test_results_2026_09',
        'test_results_default',
        'attachments',
        'custom_field_definitions',
        'custom_field_values',
        'usage_counters'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (organization_id = caselog.current_organization_id()) WITH CHECK (organization_id = caselog.current_organization_id())',
            table_name
        );
    END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO caselog_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO caselog_app;
