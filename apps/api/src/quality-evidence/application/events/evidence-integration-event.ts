import { randomUUID } from 'node:crypto';
import type { IntegrationEventContract } from '../../../core/integration-events/public-api';

export const QUALITY_EVIDENCE_INTEGRATION_EVENT = {
  candidateRevisionAdvanced: 'quality_evidence.candidate_revision_advanced',
} as const;

export type CandidateEvidenceRevisionAdvancedEvent = IntegrationEventContract<
  typeof QUALITY_EVIDENCE_INTEGRATION_EVENT.candidateRevisionAdvanced,
  {
    projectId: string;
    candidateId: string;
    evidenceRevision: number;
  }
>;

export function candidateEvidenceRevisionAdvancedEvent(input: {
  organizationId: string;
  projectId: string;
  candidateId: string;
  evidenceRevision: number;
  occurredAt: Date;
}): CandidateEvidenceRevisionAdvancedEvent {
  return {
    id: randomUUID(),
    name: QUALITY_EVIDENCE_INTEGRATION_EVENT.candidateRevisionAdvanced,
    schemaVersion: 1,
    organizationId: input.organizationId,
    source: {
      type: 'candidate_evidence_revision',
      id: input.candidateId,
      revision: String(input.evidenceRevision),
    },
    occurredAt: input.occurredAt.toISOString(),
    payload: {
      projectId: input.projectId,
      candidateId: input.candidateId,
      evidenceRevision: input.evidenceRevision,
    },
  };
}
