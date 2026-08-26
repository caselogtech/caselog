export const READINESS_METRIC_CATALOGUE = {
  'test.pass_rate': { version: '1.0.0', valueType: 'percentage' },
  'test.completion_rate': { version: '1.0.0', valueType: 'percentage' },
  'test.failed_count': { version: '1.0.0', valueType: 'integer' },
} as const;

export type ReadinessMetricKey = keyof typeof READINESS_METRIC_CATALOGUE;
export type ReadinessValueType = 'percentage' | 'integer';
export type ReadinessOperator = 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE';
export type GateImpact = 'WARNING' | 'BLOCKING';
export type EvidenceBehavior = 'UNKNOWN' | 'WARN' | 'BLOCK';
export type EvidenceTrust = 'VERIFIED' | 'AUTHENTICATED' | 'UNVERIFIED';
export type TestRunRole = 'required' | 'informational';

export type ReadinessValue =
  | { type: 'percentage'; value: string }
  | { type: 'integer'; value: number };

export type ReadinessGate = {
  id: string;
  key: string;
  position: number;
  metricKey: ReadinessMetricKey;
  metricVersion: string;
  dimensions: { testRunRole: TestRunRole };
  operator: ReadinessOperator;
  expected: ReadinessValue;
  impact: GateImpact;
  missingEvidenceBehavior: EvidenceBehavior;
  staleEvidenceBehavior: EvidenceBehavior;
  minimumTrust: EvidenceTrust;
};

export type PolicyValidationIssue = {
  gateKey: string | null;
  code:
    | 'empty_policy'
    | 'duplicate_gate_key'
    | 'duplicate_gate_position'
    | 'invalid_gate_key'
    | 'invalid_gate_position'
    | 'unsupported_metric_version'
    | 'value_type_mismatch'
    | 'value_out_of_range';
};

export function validateReadinessGates(gates: ReadinessGate[]): PolicyValidationIssue[] {
  const issues: PolicyValidationIssue[] = [];
  if (gates.length === 0) issues.push({ gateKey: null, code: 'empty_policy' });
  const keys = new Set<string>();
  const positions = new Set<number>();

  for (const gate of gates) {
    if (!/^[a-z][a-z0-9_.-]{1,49}$/.test(gate.key)) {
      issues.push({ gateKey: gate.key, code: 'invalid_gate_key' });
    }
    if (keys.has(gate.key)) issues.push({ gateKey: gate.key, code: 'duplicate_gate_key' });
    keys.add(gate.key);

    if (!Number.isSafeInteger(gate.position) || gate.position < 0) {
      issues.push({ gateKey: gate.key, code: 'invalid_gate_position' });
    }
    if (positions.has(gate.position)) {
      issues.push({ gateKey: gate.key, code: 'duplicate_gate_position' });
    }
    positions.add(gate.position);

    const definition = READINESS_METRIC_CATALOGUE[gate.metricKey];
    if (gate.metricVersion !== definition.version) {
      issues.push({ gateKey: gate.key, code: 'unsupported_metric_version' });
    }
    if (gate.expected.type !== definition.valueType) {
      issues.push({ gateKey: gate.key, code: 'value_type_mismatch' });
      continue;
    }
    if (!validExpectedValue(gate.expected)) {
      issues.push({ gateKey: gate.key, code: 'value_out_of_range' });
    }
  }
  return issues;
}

function validExpectedValue(value: ReadinessValue): boolean {
  if (value.type === 'integer') return Number.isSafeInteger(value.value) && value.value >= 0;
  return /^(?:0|[1-9]\d?|100)(?:\.\d{1,9})?$/.test(value.value) && Number(value.value) <= 100;
}
