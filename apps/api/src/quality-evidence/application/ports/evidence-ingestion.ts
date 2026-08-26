import type { EvidenceIngestRequest, EvidenceIngestResponse } from '@caselog/schemas';

export type EvidenceProducerIdentity = {
  type: 'api_token' | 'user';
  key: string;
  schemaVersion: 1;
};

export type EvidenceIngestionInput = {
  organizationId: string;
  projectSlug: string;
  producer: EvidenceProducerIdentity;
  idempotencyKey: string;
  requestHash: string;
  request: EvidenceIngestRequest;
};

export type EvidenceIngestionResult =
  | { kind: 'found'; value: EvidenceIngestResponse }
  | {
      kind:
        | 'project_not_found'
        | 'candidate_not_found'
        | 'idempotency_conflict'
        | 'superseded_observation_not_found'
        | 'supersession_conflict';
    };
