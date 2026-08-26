DROP TABLE "release_lifecycle_events";
DROP TABLE "candidate_test_runs";
DROP TRIGGER "release_candidates_immutable" ON "release_candidates";
DROP FUNCTION "caselog"."prevent_release_candidate_update"();
DROP TABLE "release_candidates";
DROP TABLE "releases";
DROP TABLE "environments";

ALTER TABLE "test_runs"
    DROP CONSTRAINT "uq_test_runs_organization_project_id";

DROP TYPE "candidate_test_run_role";
DROP TYPE "release_state";
DROP TYPE "environment_state";
