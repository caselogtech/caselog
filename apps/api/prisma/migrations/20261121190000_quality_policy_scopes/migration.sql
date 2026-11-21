ALTER TABLE test_case_versions ADD COLUMN priority varchar(10) NOT NULL DEFAULT 'medium';
ALTER TABLE test_case_versions ADD CONSTRAINT chk_test_case_versions_priority CHECK (priority IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE readiness_gates ADD COLUMN dimensions jsonb NOT NULL DEFAULT '{}', ADD COLUMN producer_key varchar(120);
ALTER TABLE readiness_gates ADD CONSTRAINT chk_readiness_gates_dimensions CHECK (jsonb_typeof(dimensions) = 'object');
ALTER TABLE readiness_gates DROP CONSTRAINT chk_readiness_gates_metric_contract;
ALTER TABLE readiness_gates ADD CONSTRAINT chk_readiness_gates_metric_contract CHECK (
  metric_version = '1.0.0' AND (
    (metric_key IN ('test.pass_rate', 'test.completion_rate', 'performance.lighthouse_score') AND expected_value_type = 'percentage') OR
    (metric_key IN ('test.failed_count', 'accessibility.wcag22_aa_violations', 'accessibility.wcag22_aa_manual_review') AND expected_value_type = 'integer')
  )
);
ALTER TABLE candidate_evidence_revisions ADD COLUMN test_scope_snapshot jsonb;
ALTER TABLE candidate_evidence_revisions ADD CONSTRAINT chk_candidate_test_scope_object CHECK (test_scope_snapshot IS NULL OR jsonb_typeof(test_scope_snapshot) = 'object');
CREATE FUNCTION caselog.guard_candidate_test_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.test_scope_snapshot IS NOT NULL AND NEW.test_scope_snapshot IS DISTINCT FROM OLD.test_scope_snapshot THEN
    RAISE EXCEPTION 'candidate test scope is immutable' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER candidate_test_scope_guard BEFORE UPDATE ON candidate_evidence_revisions FOR EACH ROW EXECUTE FUNCTION caselog.guard_candidate_test_scope();
