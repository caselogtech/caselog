import type {
  CandidateReadinessResponse,
  GateEvaluation,
  GateEvaluationExplanationCode,
  ReadinessDecision,
  ReadinessEffectiveDisposition,
  ReadinessGateInput,
  ReleaseState,
} from '@caselog/schemas';
import type { EvidenceObservation } from '@caselog/schemas/evidence';
import type { StatusBadgeTone } from '../../../shared/ui/public-api';

export type StatusPresentation = { labelKey: string; tone: StatusBadgeTone };

const PROJECTION: Record<CandidateReadinessResponse['state'], StatusPresentation> = {
  pending: { labelKey: 'readiness.projection.pending', tone: 'pending' },
  current: { labelKey: 'readiness.projection.current', tone: 'success' },
  stale: { labelKey: 'readiness.projection.stale', tone: 'warning' },
  failed: { labelKey: 'readiness.projection.failed', tone: 'danger' },
};

const RELEASE: Record<ReleaseState, StatusPresentation> = {
  draft: { labelKey: 'readiness.releaseStates.draft', tone: 'neutral' },
  active: { labelKey: 'readiness.releaseStates.active', tone: 'pending' },
  released: { labelKey: 'readiness.releaseStates.released', tone: 'success' },
  cancelled: { labelKey: 'readiness.releaseStates.cancelled', tone: 'danger' },
};

const DECISION: Record<ReadinessDecision['status'], StatusPresentation> = {
  ready: { labelKey: 'readiness.status.ready', tone: 'success' },
  at_risk: { labelKey: 'readiness.status.atRisk', tone: 'warning' },
  blocked: { labelKey: 'readiness.status.blocked', tone: 'danger' },
  unknown: { labelKey: 'readiness.status.unknown', tone: 'unknown' },
};

const DISPOSITION: Record<ReadinessEffectiveDisposition, StatusPresentation> = {
  ready: { labelKey: 'readiness.disposition.ready', tone: 'success' },
  at_risk: { labelKey: 'readiness.disposition.atRisk', tone: 'warning' },
  blocked: { labelKey: 'readiness.disposition.blocked', tone: 'danger' },
  unknown: { labelKey: 'readiness.disposition.unknown', tone: 'unknown' },
  approved_with_waiver: {
    labelKey: 'readiness.disposition.approvedWithWaiver',
    tone: 'warning',
  },
};

const GATE: Record<GateEvaluation['result'], StatusPresentation> = {
  passed: { labelKey: 'readiness.gates.results.passed', tone: 'success' },
  warning: { labelKey: 'readiness.gates.results.warning', tone: 'warning' },
  failed: { labelKey: 'readiness.gates.results.failed', tone: 'danger' },
  unknown: { labelKey: 'readiness.gates.results.unknown', tone: 'unknown' },
};

const IMPACT: Record<ReadinessGateInput['impact'], StatusPresentation> = {
  blocking: { labelKey: 'readiness.gates.impacts.blocking', tone: 'danger' },
  warning: { labelKey: 'readiness.gates.impacts.warning', tone: 'warning' },
};

const METRIC: Record<GateEvaluation['metricKey'], string> = {
  'test.pass_rate': 'readiness.metrics.passRate',
  'test.completion_rate': 'readiness.metrics.completionRate',
  'test.failed_count': 'readiness.metrics.failedCount',
};

const EXPLANATION: Record<GateEvaluationExplanationCode, string> = {
  comparison_passed: 'readiness.gates.explanations.comparisonPassed',
  comparison_failed: 'readiness.gates.explanations.comparisonFailed',
  missing_evidence: 'readiness.gates.explanations.missingEvidence',
  incomplete_evidence: 'readiness.gates.explanations.incompleteEvidence',
  stale_evidence: 'readiness.gates.explanations.staleEvidence',
  untrusted_evidence: 'readiness.gates.explanations.untrustedEvidence',
};

const DIAGNOSTIC: Record<GateEvaluation['diagnostic'], string> = {
  none: 'readiness.gates.diagnostics.none',
  missing: 'readiness.gates.diagnostics.missing',
  incomplete: 'readiness.gates.diagnostics.incomplete',
  stale: 'readiness.gates.diagnostics.stale',
  untrusted: 'readiness.gates.diagnostics.untrusted',
};

const OPERATOR: Record<GateEvaluation['operator'], string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

const TRUST: Record<EvidenceObservation['producer']['trust'], StatusPresentation> = {
  verified: { labelKey: 'readiness.evidence.trust.verified', tone: 'success' },
  authenticated: { labelKey: 'readiness.evidence.trust.authenticated', tone: 'pending' },
  unverified: { labelKey: 'readiness.evidence.trust.unverified', tone: 'unknown' },
};

const FRESHNESS: Record<EvidenceObservation['freshness'], StatusPresentation> = {
  current: { labelKey: 'readiness.evidence.freshness.current', tone: 'success' },
  stale: { labelKey: 'readiness.evidence.freshness.stale', tone: 'warning' },
};

export const readinessProjectionPresentation = (state: CandidateReadinessResponse['state']) =>
  PROJECTION[state];
export const releasePresentation = (state: ReleaseState) => RELEASE[state];
export const readinessStatusPresentation = (status: ReadinessDecision['status']) =>
  DECISION[status];
export const readinessDispositionPresentation = (value: ReadinessEffectiveDisposition) =>
  DISPOSITION[value];
export const gateResultPresentation = (result: GateEvaluation['result']) => GATE[result];
export const gateImpactPresentation = (impact: ReadinessGateInput['impact']) => IMPACT[impact];
export const metricLabel = (metric: GateEvaluation['metricKey']) => METRIC[metric];
export const explanationLabel = (code: GateEvaluationExplanationCode) => EXPLANATION[code];
export const diagnosticLabel = (diagnostic: GateEvaluation['diagnostic']) => DIAGNOSTIC[diagnostic];
export const operatorSymbol = (operator: GateEvaluation['operator']) => OPERATOR[operator];
export const evidenceTrustPresentation = (trust: EvidenceObservation['producer']['trust']) =>
  TRUST[trust];
export const evidenceFreshnessPresentation = (freshness: EvidenceObservation['freshness']) =>
  FRESHNESS[freshness];

export function formatReadinessValue(value: GateEvaluation['actual']): string {
  if (!value || value.value === null) return '—';
  return value.type === 'percentage' ? `${value.value}%` : String(value.value);
}

export function gateAttentionOrder(result: GateEvaluation['result']): number {
  return { failed: 0, unknown: 1, warning: 2, passed: 3 }[result];
}
