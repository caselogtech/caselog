import { describe, expect, it, vi } from 'vitest';
import { ReadinessReconciliationService } from '../../application/services/readiness-reconciliation.service';

const organizationId = '019c2f66-a1f4-7000-8000-000000000001';
const projectId = '019c2f66-a1f4-7000-8000-000000000002';

describe('ReadinessReconciliationService', () => {
  it('requests a missing decision for the latest evidence revision', async () => {
    const candidateId = '019c2f66-a1f4-7000-8000-000000000003';
    const assignmentId = '019c2f66-a1f4-7000-8000-000000000004';
    const reconciliation = {
      listActiveOrganizationIds: vi.fn().mockResolvedValue([organizationId]),
      listCandidates: vi
        .fn()
        .mockResolvedValueOnce([{ projectId, candidateId, assignmentId, projection: null }])
        .mockResolvedValueOnce([]),
    };
    const events = {
      processBatch: vi.fn().mockResolvedValue({ processed: 0, requested: 0 }),
    };
    const evidence = {
      load: vi.fn().mockResolvedValue({ candidateId, revision: 5, observations: [] }),
    };
    const requests = {
      request: vi.fn().mockResolvedValue({ kind: 'requested', job: {} }),
    };
    const service = new ReadinessReconciliationService(
      reconciliation as never,
      events as never,
      evidence as never,
      requests as never,
    );

    await service.run();

    expect(requests.request).toHaveBeenCalledWith({
      organizationId,
      candidateId,
      evidenceRevision: 5,
      trigger: 'RECONCILIATION',
    });
  });

  it('does not automatically retry a failed projection for the same input', async () => {
    const candidateId = '019c2f66-a1f4-7000-8000-000000000005';
    const assignmentId = '019c2f66-a1f4-7000-8000-000000000006';
    const reconciliation = {
      listActiveOrganizationIds: vi.fn().mockResolvedValue([organizationId]),
      listCandidates: vi.fn().mockResolvedValue([
        {
          projectId,
          candidateId,
          assignmentId,
          projection: {
            assignmentId,
            targetEvidenceRevision: 5,
            targetEvaluatorVersion: '1.0.0',
            state: 'FAILED',
            decision: null,
          },
        },
      ]),
    };
    const events = {
      processBatch: vi.fn().mockResolvedValue({ processed: 0, requested: 0 }),
    };
    const evidence = {
      load: vi.fn().mockResolvedValue({ candidateId, revision: 5, observations: [] }),
    };
    const requests = { request: vi.fn() };
    const service = new ReadinessReconciliationService(
      reconciliation as never,
      events as never,
      evidence as never,
      requests as never,
    );

    await service.run();

    expect(requests.request).not.toHaveBeenCalled();
  });
});
