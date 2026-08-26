export { TestRunModule } from './test-run.module';
export { TestRunReferenceService } from './application/services/test-run-reference.service';
export type { TestRunReference } from './application/ports/test-run-reference';
export { TestRunEvidenceSourceService } from './application/services/test-run-evidence-source.service';
export type { TestRunEvidenceSnapshot } from './application/ports/test-run-evidence-source';
export {
  TEST_RUN_INTEGRATION_EVENT,
  type TestRunEvidenceSourceChangedEvent,
} from './application/events/test-run-integration-event';
