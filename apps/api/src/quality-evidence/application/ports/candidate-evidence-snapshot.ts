import type { EvidenceMetricKey } from '@caselog/schemas';

export type CandidateEvidenceSnapshotObservation = {
  id: string;
  producerId: string;
  metricKey: EvidenceMetricKey;
  metricVersion: string;
  value: { type: 'percentage'; value: string | null } | { type: 'integer'; value: number | null };
  state: 'available' | 'incomplete';
  dimensions: { testRunRole: 'required' | 'informational' };
  observedAt: string;
  expiresAt: string | null;
  trust: 'verified' | 'authenticated' | 'unverified';
};

export type CandidateEvidenceSnapshot = {
  candidateId: string;
  revision: number;
  observations: CandidateEvidenceSnapshotObservation[];
};
