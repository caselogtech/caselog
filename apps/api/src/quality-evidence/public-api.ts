export { QualityEvidenceModule } from './quality-evidence.module';
export { EvidenceSnapshotService } from './application/services/evidence-snapshot.service';
export type {
  CandidateEvidenceSnapshot,
  CandidateEvidenceSnapshotObservation,
  CandidateEvidenceRevision,
} from './application/ports/candidate-evidence-snapshot';
export {
  QUALITY_EVIDENCE_INTEGRATION_EVENT,
  type CandidateEvidenceRevisionAdvancedEvent,
} from './application/events/evidence-integration-event';
