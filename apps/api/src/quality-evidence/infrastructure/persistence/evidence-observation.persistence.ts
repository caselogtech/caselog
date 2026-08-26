import type { EvidenceMetricKey, EvidenceObservation } from '@caselog/schemas';
import type { Prisma } from '../../../generated/prisma/client';

export const EVIDENCE_OBSERVATION_SELECTION = {
  id: true,
  projectId: true,
  candidateId: true,
  metricKey: true,
  metricVersion: true,
  valueType: true,
  state: true,
  percentageValue: true,
  integerValue: true,
  dimensions: true,
  observedAt: true,
  expiresAt: true,
  trustLevel: true,
  sourceType: true,
  sourceId: true,
  sourceRevision: true,
  sourceUrl: true,
  payload: true,
  supersedesObservationId: true,
  createdAt: true,
  producer: {
    select: {
      id: true,
      producerType: true,
      producerKey: true,
      schemaVersion: true,
      trustLevel: true,
    },
  },
  currentFor: { select: { evidenceRevision: true } },
} satisfies Prisma.EvidenceObservationSelect;

export type EvidenceObservationRecord = Prisma.EvidenceObservationGetPayload<{
  select: typeof EVIDENCE_OBSERVATION_SELECTION;
}>;

export function toEvidenceObservation(
  record: EvidenceObservationRecord,
  now = new Date(),
): EvidenceObservation {
  return {
    id: record.id,
    projectId: record.projectId,
    candidateId: record.candidateId,
    metricKey: record.metricKey as EvidenceMetricKey,
    metricVersion: record.metricVersion,
    value:
      record.valueType === 'PERCENTAGE'
        ? { type: 'percentage', value: record.percentageValue?.toString() ?? null }
        : { type: 'integer', value: record.integerValue },
    state: record.state.toLowerCase() as EvidenceObservation['state'],
    dimensions: record.dimensions as EvidenceObservation['dimensions'],
    observedAt: record.observedAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    freshness: record.expiresAt && record.expiresAt <= now ? 'stale' : 'current',
    producer: {
      id: record.producer.id,
      type: record.producer.producerType,
      key: record.producer.producerKey,
      schemaVersion: record.producer.schemaVersion,
      trust: record.trustLevel.toLowerCase() as EvidenceObservation['producer']['trust'],
    },
    source: {
      type: record.sourceType,
      id: record.sourceId,
      revision: record.sourceRevision,
      url: record.sourceUrl,
    },
    details: record.payload as EvidenceObservation['details'],
    supersedesObservationId: record.supersedesObservationId,
    isCurrent: record.currentFor !== null,
    createdAt: record.createdAt.toISOString(),
  };
}
