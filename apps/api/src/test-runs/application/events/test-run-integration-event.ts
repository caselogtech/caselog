import { randomUUID } from 'node:crypto';
import type { IntegrationEventContract } from '../../../core/integration-events/public-api';

export const TEST_RUN_INTEGRATION_EVENT = {
  evidenceSourceChanged: 'test_runs.evidence_source_changed',
} as const;

export type TestRunEvidenceSourceChangedEvent = IntegrationEventContract<
  typeof TEST_RUN_INTEGRATION_EVENT.evidenceSourceChanged,
  {
    actorId: string;
    projectId: string;
    testRunId: string;
    revision: number;
    reason: 'results_changed' | 'lifecycle_changed';
  }
>;

export function testRunEvidenceSourceChangedEvent(input: {
  organizationId: string;
  actorId: string;
  projectId: string;
  testRunId: string;
  revision: number;
  reason: 'results_changed' | 'lifecycle_changed';
  occurredAt: Date;
}): TestRunEvidenceSourceChangedEvent {
  return {
    id: randomUUID(),
    name: TEST_RUN_INTEGRATION_EVENT.evidenceSourceChanged,
    schemaVersion: 1,
    organizationId: input.organizationId,
    source: {
      type: 'test_run',
      id: input.testRunId,
      revision: input.revision.toString(),
    },
    occurredAt: input.occurredAt.toISOString(),
    payload: {
      actorId: input.actorId,
      projectId: input.projectId,
      testRunId: input.testRunId,
      revision: input.revision,
      reason: input.reason,
    },
  };
}
