import type { PersistedIntegrationEvent } from '../../../core/integration-events/public-api';
import type { ReleaseCandidateReference } from '../../../releases/public-api';
import { RELEASE_INTEGRATION_EVENT } from '../../../releases/public-api';
import { ResourceNotFoundError } from '../../../common/errors/domain.error';
import { describe, expect, it, vi } from 'vitest';
import { NativeEvidenceEventConsumerService } from '../../application/services/native-evidence-event-consumer.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const candidateId = '33333333-3333-4333-8333-333333333333';
const eventId = '44444444-4444-4444-8444-444444444444';

const candidate: ReleaseCandidateReference = {
  id: candidateId,
  projectId,
  releaseId: '55555555-5555-4555-8555-555555555555',
  releaseState: 'active',
  sourceRevision: 'abc123',
  buildIdentifier: null,
  artifactDigest: null,
  identityHash: 'a'.repeat(64),
  testRuns: [],
};

const event: PersistedIntegrationEvent = {
  id: eventId,
  name: RELEASE_INTEGRATION_EVENT.candidateCreated,
  schemaVersion: 1,
  organizationId,
  source: { type: 'release_candidate', id: candidateId, revision: '1' },
  occurredAt: '2026-08-27T12:00:00.000Z',
  createdAt: '2026-08-27T12:00:00.000Z',
  payload: { candidateId },
};

describe('NativeEvidenceEventConsumerService', () => {
  it('persists a candidate-scoped issue and leaves the event retryable', async () => {
    const events = { read: vi.fn().mockResolvedValue([event]), markConsumed: vi.fn() };
    const candidates = { resolve: vi.fn().mockResolvedValue(candidate) };
    const materializer = {
      materialize: vi.fn().mockRejectedValue(new ResourceNotFoundError('test_run')),
    };
    const issues = { recordFailure: vi.fn().mockResolvedValue(undefined) };
    const consumer = new NativeEvidenceEventConsumerService(
      events as never,
      candidates as never,
      materializer as never,
      issues as never,
    );

    await expect(consumer.processBatch(organizationId)).resolves.toEqual({
      processed: 1,
      observationsCreated: 0,
      halted: true,
    });
    expect(issues.recordFailure).toHaveBeenCalledWith({
      organizationId,
      projectId,
      candidateId,
      sourceEventId: eventId,
      code: 'test_run_unavailable',
    });
    expect(events.markConsumed).not.toHaveBeenCalled();
  });
});
