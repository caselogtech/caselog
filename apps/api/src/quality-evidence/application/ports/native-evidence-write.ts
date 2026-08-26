import type { CandidateTestRunRole } from '@caselog/schemas';
import type {
  NativeTestMetricObservation,
  NativeTestMetricPayload,
} from '../../domain/models/native-test-metric';

export const NATIVE_EVIDENCE_CONSUMER = 'quality-evidence.native-tests';

export type NativeEvidenceObservationInput = NativeTestMetricObservation & {
  role: CandidateTestRunRole;
  sourceRevision: string;
  observedAt: Date;
  expiresAt: Date;
  idempotencyKey: string;
  payload: NativeTestMetricPayload;
};

export type NativeEvidenceMaterializationInput = {
  organizationId: string;
  projectId: string;
  candidateId: string;
  eventIds: string[];
  observations: NativeEvidenceObservationInput[];
};

export type NativeEvidenceMaterializationResult = {
  revision: number;
  created: number;
};
