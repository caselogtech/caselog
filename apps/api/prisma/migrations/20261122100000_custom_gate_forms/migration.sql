-- Additive migration: legacy published gates and decisions retain their existing behavior.
ALTER TABLE readiness_gates ADD COLUMN form_definition jsonb;
ALTER TABLE gate_evaluations ADD COLUMN criteria jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE readiness_gates ADD CONSTRAINT ck_readiness_gate_form CHECK (
  (metric_key = 'gate.form_response' AND form_definition IS NOT NULL
    AND jsonb_typeof(form_definition) = 'object'
    AND octet_length(form_definition::text) <= 131072
    AND operator = 'eq' AND expected_value_type = 'integer' AND expected_integer = 1
    AND minimum_trust = 'authenticated'
    AND missing_evidence_behavior = 'block' AND stale_evidence_behavior = 'block'
    AND producer_key IS NULL AND test_run_role = 'required')
  OR (metric_key <> 'gate.form_response' AND form_definition IS NULL)
);
ALTER TABLE gate_evaluations ADD CONSTRAINT ck_gate_evaluation_criteria CHECK (
  jsonb_typeof(criteria) = 'array' AND jsonb_array_length(criteria) <= 50
);
-- Recovery: roll forward. Do not drop these columns after publishing a form policy.

ALTER TABLE readiness_gates DROP CONSTRAINT chk_readiness_gates_metric_contract;
ALTER TABLE readiness_gates ADD CONSTRAINT chk_readiness_gates_metric_contract CHECK (
 metric_version = '1.0.0' AND (
  (metric_key IN ('test.pass_rate', 'test.completion_rate', 'performance.lighthouse_score') AND expected_value_type = 'percentage') OR
  (metric_key IN ('test.failed_count', 'accessibility.wcag22_aa_violations', 'accessibility.wcag22_aa_manual_review', 'accessibility.manual_review', 'gate.form_response') AND expected_value_type = 'integer')
 )
);
