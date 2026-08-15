REVOKE ALL ON FUNCTION public.purge_expired_workspace(UUID, TIMESTAMPTZ) FROM caselog_app;
DROP FUNCTION public.purge_expired_workspace(UUID, TIMESTAMPTZ);
GRANT DELETE ON "organizations" TO caselog_app;

CREATE OR REPLACE FUNCTION public.list_current_user_deleted_workspaces()
RETURNS TABLE (
    organization_id UUID,
    name VARCHAR(120),
    slug VARCHAR(30),
    membership_id UUID,
    role public.membership_role,
    deleted_at TIMESTAMPTZ(3),
    recoverable_until TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        organization.id,
        organization.name,
        organization.slug,
        membership.id,
        membership.role,
        organization.deleted_at,
        organization.deleted_at + INTERVAL '30 days'
    FROM public.memberships AS membership
    JOIN public.organizations AS organization
      ON organization.id = membership.organization_id
    WHERE membership.user_id = NULLIF(current_setting('caselog.user_id', true), '')::UUID
      AND membership.deleted_at IS NULL
      AND organization.deleted_at IS NOT NULL
      AND organization.deleted_at + INTERVAL '30 days' > CURRENT_TIMESTAMP
    ORDER BY organization.deleted_at DESC, organization.id
$$;

ALTER TABLE "organization_slug_redirects" DROP CONSTRAINT "organization_slug_redirects_organization_id_fkey",
    ADD CONSTRAINT "organization_slug_redirects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_organization_id_fkey",
    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_organization_id_fkey",
    ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workspace_invitations" DROP CONSTRAINT "workspace_invitations_organization_id_fkey",
    ADD CONSTRAINT "workspace_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "projects" DROP CONSTRAINT "projects_organization_id_fkey",
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suites" DROP CONSTRAINT "suites_organization_id_fkey",
    ADD CONSTRAINT "suites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sections" DROP CONSTRAINT "sections_organization_id_fkey",
    ADD CONSTRAINT "sections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_cases" DROP CONSTRAINT "test_cases_organization_id_fkey",
    ADD CONSTRAINT "test_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_case_versions" DROP CONSTRAINT "test_case_versions_organization_id_fkey",
    ADD CONSTRAINT "test_case_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "result_statuses" DROP CONSTRAINT "result_statuses_organization_id_fkey",
    ADD CONSTRAINT "result_statuses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_runs" DROP CONSTRAINT "test_runs_organization_id_fkey",
    ADD CONSTRAINT "test_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_run_items" DROP CONSTRAINT "test_run_items_organization_id_fkey",
    ADD CONSTRAINT "test_run_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_results" DROP CONSTRAINT "test_results_organization_id_fkey",
    ADD CONSTRAINT "test_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_step_results" DROP CONSTRAINT "test_step_results_organization_id_fkey",
    ADD CONSTRAINT "test_step_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attachment_blobs" DROP CONSTRAINT "attachment_blobs_organization_id_fkey",
    ADD CONSTRAINT "attachment_blobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_organization_id_fkey",
    ADD CONSTRAINT "attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "upload_sessions" DROP CONSTRAINT "upload_sessions_organization_id_fkey",
    ADD CONSTRAINT "upload_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custom_field_definitions" DROP CONSTRAINT "custom_field_definitions_organization_id_fkey",
    ADD CONSTRAINT "custom_field_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custom_field_values" DROP CONSTRAINT "custom_field_values_organization_id_fkey",
    ADD CONSTRAINT "custom_field_values_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "usage_counters" DROP CONSTRAINT "usage_counters_organization_id_fkey",
    ADD CONSTRAINT "usage_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "idx_organizations_workspace_purge";
ALTER TABLE "organizations" DROP COLUMN "purge_started_at";
