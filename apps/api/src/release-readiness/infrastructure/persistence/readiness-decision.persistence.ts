import type {
  CandidatePolicyAssignment,
  CandidateReadinessResponse,
  ReadinessDecision,
  ReadinessGateInput,
} from '@caselog/schemas';
import { EvidenceValueType, type Prisma } from '../../../generated/prisma/client';
import type { ReadinessGate } from '../../domain/models/readiness-policy';
import { effectiveReadinessDisposition } from '../../domain/policies/readiness-waiver.policy';
import type { ReadinessWaiverRecord } from './readiness-waiver.persistence';
import { toReadinessWaiver } from './readiness-waiver.persistence';

export const READINESS_GATE_FOR_EVALUATION_SELECTION = {
  id: true,
  key: true,
  position: true,
  metricKey: true,
  metricVersion: true,
  testRunRole: true,
  operator: true,
  expectedValueType: true,
  expectedPercentage: true,
  expectedInteger: true,
  impact: true,
  missingEvidenceBehavior: true,
  staleEvidenceBehavior: true,
  minimumTrust: true,
} satisfies Prisma.ReadinessGateSelect;

export const READINESS_DECISION_SCALAR_SELECTION = {
  id: true,
  candidateId: true,
  assignmentId: true,
  policyVersionId: true,
  evidenceRevision: true,
  evaluatorVersion: true,
  trigger: true,
  status: true,
  evaluatedAt: true,
} satisfies Prisma.ReadinessDecisionSelect;

export const GATE_EVALUATION_SCALAR_SELECTION = {
  id: true,
  decisionId: true,
  gateId: true,
  position: true,
  result: true,
  diagnostic: true,
  metricKey: true,
  metricVersion: true,
  dimensions: true,
  operator: true,
  expectedValueType: true,
  expectedPercentage: true,
  expectedInteger: true,
  actualPercentage: true,
  actualInteger: true,
  selectedObservationId: true,
  explanationCode: true,
} satisfies Prisma.GateEvaluationSelect;

export type ReadinessGateRecord = Prisma.ReadinessGateGetPayload<{
  select: typeof READINESS_GATE_FOR_EVALUATION_SELECTION;
}>;
export type ReadinessDecisionScalarRecord = Prisma.ReadinessDecisionGetPayload<{
  select: typeof READINESS_DECISION_SCALAR_SELECTION;
}>;
export type GateEvaluationScalarRecord = Prisma.GateEvaluationGetPayload<{
  select: typeof GATE_EVALUATION_SCALAR_SELECTION;
}>;

export type ReadinessEvaluationContext = {
  assignment: CandidatePolicyAssignment;
  gates: ReadinessGate[];
};

export type HydratedReadinessDecisionRecord = ReadinessDecisionScalarRecord & {
  policyVersion: { id: string; version: number };
  gateEvaluations: Array<GateEvaluationScalarRecord & { gateKey: string }>;
  waivers: ReadinessWaiverRecord[];
};

export type CurrentReadinessRecord = {
  targetEvidenceRevision: number;
  targetEvaluatorVersion: string;
  state: 'PENDING' | 'CURRENT' | 'STALE' | 'FAILED';
  failureCode: string | null;
  assignment: CandidatePolicyAssignment;
  decision: HydratedReadinessDecisionRecord | null;
};

export function toDomainReadinessGates(records: ReadinessGateRecord[]): ReadinessGate[] {
  return records.map((gate) => ({
    id: gate.id,
    key: gate.key,
    position: gate.position,
    metricKey: gate.metricKey as ReadinessGate['metricKey'],
    metricVersion: gate.metricVersion,
    dimensions: {
      testRunRole: gate.testRunRole.toLowerCase() as ReadinessGate['dimensions']['testRunRole'],
    },
    operator: gate.operator,
    expected:
      gate.expectedValueType === EvidenceValueType.PERCENTAGE
        ? { type: 'percentage', value: gate.expectedPercentage?.toString() ?? '0' }
        : { type: 'integer', value: gate.expectedInteger ?? 0 },
    impact: gate.impact,
    missingEvidenceBehavior: gate.missingEvidenceBehavior,
    staleEvidenceBehavior: gate.staleEvidenceBehavior,
    minimumTrust: gate.minimumTrust,
  }));
}

export function toCandidateReadinessResponse(
  record: CurrentReadinessRecord,
  currentEvidenceRevision: number,
): CandidateReadinessResponse {
  const decision = record.decision ? toReadinessDecision(record.decision) : null;
  const state =
    record.state !== 'FAILED' && decision && decision.evidenceRevision < currentEvidenceRevision
      ? ('stale' as const)
      : (record.state.toLowerCase() as CandidateReadinessResponse['state']);
  return {
    candidateId: record.assignment.candidateId,
    assignment: record.assignment,
    state,
    targetEvidenceRevision: Math.max(record.targetEvidenceRevision, currentEvidenceRevision),
    targetEvaluatorVersion: record.targetEvaluatorVersion,
    currentEvidenceRevision,
    failureCode: record.failureCode,
    decision,
  };
}

export function toReadinessDecision(
  record: HydratedReadinessDecisionRecord,
  at = new Date(),
): ReadinessDecision {
  const waivers = record.waivers.map((waiver) => toReadinessWaiver(waiver, at));
  return {
    id: record.id,
    candidateId: record.candidateId,
    assignmentId: record.assignmentId,
    policyVersion: record.policyVersion,
    evidenceRevision: record.evidenceRevision,
    evaluatorVersion: record.evaluatorVersion,
    trigger: record.trigger.toLowerCase() as ReadinessDecision['trigger'],
    status: record.status.toLowerCase() as ReadinessDecision['status'],
    effectiveDisposition: effectiveReadinessDisposition({
      computedStatus: record.status,
      gates: record.gateEvaluations.map((gate) => ({ id: gate.id, result: gate.result })),
      waivers: record.waivers.map((waiver) => ({
        scope: waiver.scope,
        gateEvaluationId: waiver.gateEvaluationId,
        expiresAt: waiver.expiresAt,
        revokedAt: waiver.revocation?.revokedAt ?? null,
      })),
      at,
    }),
    evaluatedAt: record.evaluatedAt.toISOString(),
    gates: record.gateEvaluations.map((gate) => ({
      id: gate.id,
      gateId: gate.gateId,
      gateKey: gate.gateKey,
      position: gate.position,
      result: gate.result.toLowerCase() as ReadinessDecision['gates'][number]['result'],
      diagnostic: gate.diagnostic.toLowerCase() as ReadinessDecision['gates'][number]['diagnostic'],
      metricKey: gate.metricKey as ReadinessDecision['gates'][number]['metricKey'],
      metricVersion: gate.metricVersion,
      dimensions: gate.dimensions as ReadinessDecision['gates'][number]['dimensions'],
      operator: gate.operator.toLowerCase() as ReadinessDecision['gates'][number]['operator'],
      expected: value(
        gate.expectedValueType,
        gate.expectedPercentage?.toString() ?? null,
        gate.expectedInteger,
      ) as ReadinessGateInput['expected'],
      actual: value(
        gate.expectedValueType,
        gate.actualPercentage?.toString() ?? null,
        gate.actualInteger,
      ),
      selectedObservationId: gate.selectedObservationId,
      explanationCode:
        gate.explanationCode as ReadinessDecision['gates'][number]['explanationCode'],
    })),
    waivers,
  };
}

function value(
  type: EvidenceValueType,
  percentage: string | null,
  integer: number | null,
): ReadinessGateInput['expected'] | null {
  if (type === EvidenceValueType.PERCENTAGE) {
    return percentage === null ? null : { type: 'percentage', value: percentage };
  }
  return integer === null ? null : { type: 'integer', value: integer };
}
