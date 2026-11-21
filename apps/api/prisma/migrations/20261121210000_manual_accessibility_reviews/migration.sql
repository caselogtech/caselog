ALTER TYPE attachment_target_type ADD VALUE 'candidate_report';
ALTER TABLE upload_sessions ADD COLUMN candidate_id uuid;
ALTER TABLE upload_sessions ADD CONSTRAINT upload_sessions_candidate_fkey FOREIGN KEY (organization_id, project_id, candidate_id) REFERENCES release_candidates (organization_id, project_id, id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE upload_sessions DROP CONSTRAINT chk_upload_sessions_target;
ALTER TABLE upload_sessions ADD CONSTRAINT chk_upload_sessions_target CHECK (
 (test_run_id IS NOT NULL AND test_run_item_id IS NOT NULL AND case_version_id IS NULL AND candidate_id IS NULL) OR
 (test_run_id IS NULL AND test_run_item_id IS NULL AND case_version_id IS NOT NULL AND candidate_id IS NULL) OR
 (test_run_id IS NULL AND test_run_item_id IS NULL AND case_version_id IS NULL AND candidate_id IS NOT NULL)
);
CREATE INDEX idx_upload_sessions_org_candidate_completed_expires ON upload_sessions (organization_id, candidate_id, completed_at, expires_at);
ALTER TABLE readiness_gates DROP CONSTRAINT chk_readiness_gates_metric_contract;
ALTER TABLE readiness_gates ADD CONSTRAINT chk_readiness_gates_metric_contract CHECK (
 metric_version = '1.0.0' AND (
  (metric_key IN ('test.pass_rate', 'test.completion_rate', 'performance.lighthouse_score') AND expected_value_type = 'percentage') OR
  (metric_key IN ('test.failed_count', 'accessibility.wcag22_aa_violations', 'accessibility.wcag22_aa_manual_review', 'accessibility.manual_review') AND expected_value_type = 'integer')
 )
);
