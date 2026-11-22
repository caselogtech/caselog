import type {
  EvidenceIngestRequest,
  EvidenceIngestResponse,
  EvidenceMetricKey,
  GateFormResponseDetails,
} from '@caselog/schemas';

export type EvidenceProducerIdentity = {
  type: 'api_token' | 'user' | 'manual_review';
  key: string;
  schemaVersion: 1;
};

export type EvidenceIngestionInput = {
  organizationId: string;
  projectSlug: string;
  producer: EvidenceProducerIdentity;
  idempotencyKey: string;
  requestHash: string;
  request: Omit<EvidenceIngestRequest, 'expiresAt' | 'metricKey' | 'details'> & {
    expiresAt: string | null;
    metricKey: EvidenceMetricKey;
    details: EvidenceIngestRequest['details'] | GateFormResponseDetails;
  };
  manualReview?: { expectedObservationId: string | null; actorId: string };
};

export type EvidenceIngestionResult =
  | { kind: 'found'; value: EvidenceIngestResponse }
  | {
      kind:
        | 'project_not_found'
        | 'candidate_not_found'
        | 'idempotency_conflict'
        | 'review_changed'
        | 'superseded_observation_not_found'
        | 'supersession_conflict';
    };
