-- Apply only after the later migrations have been rolled back.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM caselog_app;

DROP TABLE IF EXISTS
    "usage_counters",
    "custom_field_values",
    "custom_field_definitions",
    "attachments",
    "test_results",
    "test_run_items",
    "test_runs",
    "result_statuses",
    "test_case_versions",
    "test_cases",
    "sections",
    "suites",
    "projects",
    "memberships",
    "users",
    "organizations";

DROP FUNCTION IF EXISTS "caselog"."current_organization_id"();
DROP SCHEMA IF EXISTS "caselog";

DROP TYPE IF EXISTS "attachment_target_type";
DROP TYPE IF EXISTS "custom_field_entity_type";
DROP TYPE IF EXISTS "custom_field_type";
DROP TYPE IF EXISTS "run_status";
DROP TYPE IF EXISTS "case_template";
DROP TYPE IF EXISTS "membership_role";

-- citext, btree_gin, and caselog_app may be shared or deployment-provisioned,
-- so rollback deliberately leaves those cluster-level objects in place.
