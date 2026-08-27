import type { PersistedIntegrationEvent } from '../../../core/integration-events/public-api';
import { describe, expect, it, vi } from 'vitest';
import { QUALITY_EVIDENCE_INTEGRATION_EVENT } from '../../../quality-evidence/public-api';
import { ReadinessEventConsumerService } from '../../application/services/readiness-event-consumer.service';

const organizationId = '019c2f66-a1f4-7000-8000-000000000001';
const candidateId = '019c2f66-a1f4-7000-8000-000000000002';

describe('ReadinessEventConsumerService', () => {
  it('requests evaluation before acknowledging a durable evidence event', async () => {
    const events = {
      read: vi.fn().mockResolvedValue([evidenceEvent()]),
      markConsumed: vi.fn().mockResolvedValue(undefined),
    };
    const requests = {
      request: vi.fn().mockResolvedValue({ kind: 'requested', job: {} }),
    };
    const consumer = new ReadinessEventConsumerService(events as never, requests as never);

    await expect(consumer.processBatch(organizationId, 100)).resolves.toEqual({
      processed: 1,
      requested: 1,
    });
    expect(requests.request).toHaveBeenCalledWith({
      organizationId,
      candidateId,
      evidenceRevision: 3,
      trigger: 'EVIDENCE_CHANGED',
    });
    expect(events.markConsumed).toHaveBeenCalledWith(organizationId, evidenceEvent().id);
    expect(requests.request.mock.invocationCallOrder[0]).toBeLessThan(
      events.markConsumed.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('leaves the event unconsumed when enqueueing fails', async () => {
    const events = {
      read: vi.fn().mockResolvedValue([evidenceEvent()]),
      markConsumed: vi.fn(),
    };
    const requests = { request: vi.fn().mockRejectedValue(new Error('queue unavailable')) };
    const consumer = new ReadinessEventConsumerService(events as never, requests as never);

    await expect(consumer.processBatch(organizationId, 100)).rejects.toThrow('queue unavailable');
    expect(events.markConsumed).not.toHaveBeenCalled();
  });
});

function evidenceEvent(): PersistedIntegrationEvent {
  return {
    id: '019c2f66-a1f4-7000-8000-000000000004',
    name: QUALITY_EVIDENCE_INTEGRATION_EVENT.candidateRevisionAdvanced,
    schemaVersion: 1,
    organizationId,
    source: { type: 'candidate_evidence_revision', id: candidateId, revision: '3' },
    occurredAt: '2026-08-27T12:00:00.000Z',
    createdAt: '2026-08-27T12:00:00.000Z',
    payload: {
      projectId: '019c2f66-a1f4-7000-8000-000000000005',
      candidateId,
      evidenceRevision: 3,
    },
  };
}
