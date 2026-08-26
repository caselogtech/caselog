REVOKE ALL ON FUNCTION "caselog"."reject_candidate_policy_assignment_update"() FROM caselog_app;
DROP TRIGGER "candidate_policy_assignments_immutable" ON "candidate_policy_assignments";
DROP FUNCTION "caselog"."reject_candidate_policy_assignment_update"();
DROP TABLE "current_candidate_policy_assignments";
DROP TABLE "candidate_policy_assignments";
ALTER TABLE "release_policy_versions"
DROP CONSTRAINT "uq_release_policy_versions_org_project_policy_id";
