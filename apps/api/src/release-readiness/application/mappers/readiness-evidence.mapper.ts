import type { CandidateEvidenceSnapshotObservation } from '../../../quality-evidence/public-api';
import type { ReadinessEvidence } from '../../domain/models/readiness-evidence';

export function toReadinessEvidence(
  observation: CandidateEvidenceSnapshotObservation,
): ReadinessEvidence {
  const value =
    observation.value.value === null
      ? null
      : observation.value.type === 'percentage'
        ? { type: 'percentage' as const, value: observation.value.value }
        : { type: 'integer' as const, value: observation.value.value };
  return {
    ...(observation.formResponse ? { formResponse: observation.formResponse } : {}),
    observationId: observation.id,
    producerId: observation.producerId,
    producerKey: observation.producerKey,
    metricKey: observation.metricKey,
    metricVersion: observation.metricVersion,
    dimensions: observation.dimensions,
    state: observation.state.toUpperCase() as ReadinessEvidence['state'],
    value,
    observedAt: observation.observedAt,
    expiresAt: observation.expiresAt,
    trust: observation.trust.toUpperCase() as ReadinessEvidence['trust'],
  };
}
