import type { ReadinessEvidence } from '../models/readiness-evidence';
import {
  type EvidenceBehavior,
  type EvidenceTrust,
  type ReadinessGate,
  type ReadinessOperator,
  type ReadinessValue,
  validateReadinessGates,
} from '../models/readiness-policy';

export const READINESS_EVALUATOR_VERSION = '1.0.0';

export type GateEvaluationResult = 'PASSED' | 'WARNING' | 'FAILED' | 'UNKNOWN';
export type GateDiagnostic = 'NONE' | 'MISSING' | 'INCOMPLETE' | 'STALE' | 'UNTRUSTED';
export type ReadinessStatus = 'READY' | 'AT_RISK' | 'BLOCKED' | 'UNKNOWN';

export type GateEvaluation = {
  gateId: string;
  gateKey: string;
  position: number;
  result: GateEvaluationResult;
  diagnostic: GateDiagnostic;
  actual: ReadinessValue | null;
  expected: ReadinessValue;
  selectedObservationId: string | null;
  explanationCode:
    | 'comparison_passed'
    | 'comparison_failed'
    | 'missing_evidence'
    | 'incomplete_evidence'
    | 'stale_evidence'
    | 'untrusted_evidence';
};

export type ReadinessEvaluation = {
  evaluatorVersion: typeof READINESS_EVALUATOR_VERSION;
  status: ReadinessStatus;
  gates: GateEvaluation[];
};

const UNAVAILABLE_EXPLANATION = {
  MISSING: 'missing_evidence',
  INCOMPLETE: 'incomplete_evidence',
  STALE: 'stale_evidence',
  UNTRUSTED: 'untrusted_evidence',
} as const satisfies Record<Exclude<GateDiagnostic, 'NONE'>, GateEvaluation['explanationCode']>;

export function evaluateReadiness(input: {
  gates: ReadinessGate[];
  evidence: ReadinessEvidence[];
  evaluatedAt: string;
}): ReadinessEvaluation {
  const issues = validateReadinessGates(input.gates);
  if (issues.length > 0)
    throw new Error(`Cannot evaluate invalid readiness gates: ${issues[0]?.code}`);
  const evaluatedAt = new Date(input.evaluatedAt);
  if (Number.isNaN(evaluatedAt.getTime())) throw new Error('Invalid evaluation timestamp');

  const gates = [...input.gates]
    .sort((left, right) => left.position - right.position || left.key.localeCompare(right.key))
    .map((gate) => evaluateGate(gate, input.evidence, evaluatedAt));
  return {
    evaluatorVersion: READINESS_EVALUATOR_VERSION,
    status: classify(gates),
    gates,
  };
}

function evaluateGate(
  gate: ReadinessGate,
  evidence: ReadinessEvidence[],
  evaluatedAt: Date,
): GateEvaluation {
  const matching = evidence.filter(
    (observation) =>
      observation.metricKey === gate.metricKey &&
      observation.metricVersion === gate.metricVersion &&
      observation.dimensions.testRunRole === gate.dimensions.testRunRole,
  );
  if (matching.length === 0) return unavailable(gate, 'MISSING', null);

  const trusted = matching.filter(
    (observation) => trustRank(observation.trust) >= trustRank(gate.minimumTrust),
  );
  if (trusted.length === 0) return unavailable(gate, 'UNTRUSTED', best(matching));

  const complete = trusted.filter(
    (observation) => observation.state === 'AVAILABLE' && observation.value !== null,
  );
  if (complete.length === 0) return unavailable(gate, 'INCOMPLETE', best(trusted));

  const fresh = complete.filter(
    (observation) => !observation.expiresAt || new Date(observation.expiresAt) > evaluatedAt,
  );
  if (fresh.length === 0) return unavailable(gate, 'STALE', best(complete));

  const selected = best(fresh);
  if (!selected?.value || selected.value.type !== gate.expected.type) {
    throw new Error(`Evidence type does not match gate ${gate.key}`);
  }
  const passed = compare(selected.value, gate.expected, gate.operator);
  return {
    gateId: gate.id,
    gateKey: gate.key,
    position: gate.position,
    result: passed ? 'PASSED' : gate.impact === 'BLOCKING' ? 'FAILED' : 'WARNING',
    diagnostic: 'NONE',
    actual: selected.value,
    expected: gate.expected,
    selectedObservationId: selected.observationId,
    explanationCode: passed ? 'comparison_passed' : 'comparison_failed',
  };
}

function unavailable(
  gate: ReadinessGate,
  diagnostic: Exclude<GateDiagnostic, 'NONE'>,
  selected: ReadinessEvidence | null,
): GateEvaluation {
  const behavior =
    diagnostic === 'STALE' ? gate.staleEvidenceBehavior : gate.missingEvidenceBehavior;
  return {
    gateId: gate.id,
    gateKey: gate.key,
    position: gate.position,
    result: behaviorResult(behavior),
    diagnostic,
    actual: selected?.value ?? null,
    expected: gate.expected,
    selectedObservationId: selected?.observationId ?? null,
    explanationCode: unavailableExplanation(diagnostic),
  };
}

function unavailableExplanation(
  diagnostic: Exclude<GateDiagnostic, 'NONE'>,
): GateEvaluation['explanationCode'] {
  return UNAVAILABLE_EXPLANATION[diagnostic];
}

function behaviorResult(behavior: EvidenceBehavior): GateEvaluationResult {
  if (behavior === 'BLOCK') return 'FAILED';
  if (behavior === 'WARN') return 'WARNING';
  return 'UNKNOWN';
}

function classify(gates: GateEvaluation[]): ReadinessStatus {
  if (gates.some(({ result }) => result === 'FAILED')) return 'BLOCKED';
  if (gates.some(({ result }) => result === 'UNKNOWN')) return 'UNKNOWN';
  if (gates.some(({ result }) => result === 'WARNING')) return 'AT_RISK';
  return 'READY';
}

function best(evidence: ReadinessEvidence[]): ReadinessEvidence | null {
  return (
    [...evidence].sort(
      (left, right) =>
        trustRank(right.trust) - trustRank(left.trust) ||
        new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime() ||
        left.observationId.localeCompare(right.observationId),
    )[0] ?? null
  );
}

function trustRank(trust: EvidenceTrust): number {
  return { UNVERIFIED: 0, AUTHENTICATED: 1, VERIFIED: 2 }[trust];
}

function compare(
  actual: ReadinessValue,
  expected: ReadinessValue,
  operator: ReadinessOperator,
): boolean {
  const order = compareValues(actual, expected);
  return {
    EQ: order === 0,
    NE: order !== 0,
    GT: order > 0,
    GTE: order >= 0,
    LT: order < 0,
    LTE: order <= 0,
  }[operator];
}

function compareValues(actual: ReadinessValue, expected: ReadinessValue): number {
  if (actual.type !== expected.type) throw new Error('Cannot compare different readiness values');
  const left = actual.type === 'percentage' ? scaledPercentage(actual.value) : BigInt(actual.value);
  const right =
    expected.type === 'percentage' ? scaledPercentage(expected.value) : BigInt(expected.value);
  return left < right ? -1 : left > right ? 1 : 0;
}

function scaledPercentage(value: string): bigint {
  const [integer = '0', fraction = ''] = value.split('.');
  return BigInt(integer) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
}
