import { describe, expect, it, vi } from 'vitest';
import {
  EvidenceRevisionPendingError,
  ReadinessAutomatedEvaluationService,
} from '../../application/services/readiness-automated-evaluation.service';
import type { ReadinessEvaluationJob } from '../../domain/models/readiness-evaluation-job';

const organizationId = '019c2f66-a1f4-7000-8000-000000000001';
const candidateId = '019c2f66-a1f4-7000-8000-000000000002';
const projectId = '019c2f66-a1f4-7000-8000-000000000003';
const assignmentId = '019c2f66-a1f4-7000-8000-000000000004';
const policyVersionId = '019c2f66-a1f4-7000-8000-000000000005';

const job = {
  organizationId,
  candidateId,
  assignmentId,
  evidenceRevision: 3,
  evaluatorVersion: '1.0.0',
  trigger: 'EVIDENCE_CHANGED',
} as const satisfies ReadinessEvaluationJob;

describe('ReadinessAutomatedEvaluationService', () => {
  it('retries when the requested evidence revision is not visible yet', async () => {
    const { service, decisions } = setup(2);

    await expect(service.evaluate(job)).rejects.toBeInstanceOf(EvidenceRevisionPendingError);
    expect(decisions.record).not.toHaveBeenCalled();
  });

  it('ignores obsolete jobs instead of evaluating newer evidence under an old key', async () => {
    const { service, decisions } = setup(4);

    await expect(service.evaluate(job)).resolves.toEqual({ kind: 'obsolete' });
    expect(decisions.record).not.toHaveBeenCalled();
  });

  it('records the exact requested input as a system evaluation', async () => {
    const { service, decisions } = setup(3);
    decisions.record.mockResolvedValue({
      kind: 'found',
      value: { decision: { id: '019c2f66-a1f4-7000-8000-000000000006' } },
    });

    await expect(service.evaluate(job)).resolves.toEqual({
      kind: 'recorded',
      decisionId: '019c2f66-a1f4-7000-8000-000000000006',
    });
    expect(decisions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        projectId,
        candidateId,
        assignmentId,
        policyVersionId,
        evidenceRevision: 3,
        evaluatedById: null,
        trigger: 'EVIDENCE_CHANGED',
        evaluation: expect.objectContaining({ status: 'READY' }),
      }),
    );
  });
});

function setup(evidenceRevision: number) {
  const candidates = {
    resolve: vi.fn().mockResolvedValue({ id: candidateId, projectId, testRuns: [] }),
  };
  const evidence = {
    load: vi.fn().mockResolvedValue({
      candidateId,
      revision: evidenceRevision,
      observations: [
        {
          id: '019c2f66-a1f4-7000-8000-000000000008',
          producerId: '019c2f66-a1f4-7000-8000-000000000009',
          metricKey: 'test.pass_rate',
          metricVersion: '1.0.0',
          value: { type: 'percentage', value: '95' },
          state: 'available',
          dimensions: { testRunRole: 'required' },
          observedAt: '2026-08-27T11:59:00.000Z',
          expiresAt: '2099-08-27T13:00:00.000Z',
          trust: 'authenticated',
        },
      ],
    }),
  };
  const decisions = {
    contextForCandidate: vi.fn().mockResolvedValue({
      kind: 'found',
      value: {
        assignment: {
          id: assignmentId,
          candidateId,
          policy: { id: '019c2f66-a1f4-7000-8000-000000000007', key: 'default', name: 'Default' },
          policyVersion: { id: policyVersionId, version: 1 },
          assignedAt: '2026-08-27T12:00:00.000Z',
        },
        gates: [
          {
            id: '019c2f66-a1f4-7000-8000-000000000010',
            key: 'pass-rate',
            position: 0,
            metricKey: 'test.pass_rate',
            metricVersion: '1.0.0',
            dimensions: { testRunRole: 'required' },
            operator: 'GTE',
            expected: { type: 'percentage', value: '90' },
            impact: 'BLOCKING',
            missingEvidenceBehavior: 'UNKNOWN',
            staleEvidenceBehavior: 'UNKNOWN',
            minimumTrust: 'AUTHENTICATED',
          },
        ],
      },
    }),
    record: vi.fn(),
  };
  return {
    service: new ReadinessAutomatedEvaluationService(
      candidates as never,
      evidence as never,
      decisions as never,
    ),
    decisions,
  };
}
