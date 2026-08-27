import { describe, expect, it } from 'vitest';
import { toCandidateReadinessResponse } from '../../infrastructure/persistence/readiness-decision.persistence';

describe('current readiness projection mapping', () => {
  it('keeps a terminal evaluation failure visible when the previous decision is stale', () => {
    const response = toCandidateReadinessResponse(
      {
        targetEvidenceRevision: 4,
        targetEvaluatorVersion: '1.0.0',
        state: 'FAILED',
        failureCode: 'evaluation_retries_exhausted',
        assignment: {
          id: '019c2f66-a1f4-7000-8000-000000000001',
          candidateId: '019c2f66-a1f4-7000-8000-000000000002',
          policy: {
            id: '019c2f66-a1f4-7000-8000-000000000003',
            key: 'default',
            name: 'Default',
          },
          policyVersion: { id: '019c2f66-a1f4-7000-8000-000000000004', version: 1 },
          assignedAt: '2026-08-27T12:00:00.000Z',
        },
        decision: {
          id: '019c2f66-a1f4-7000-8000-000000000005',
          candidateId: '019c2f66-a1f4-7000-8000-000000000002',
          assignmentId: '019c2f66-a1f4-7000-8000-000000000001',
          policyVersionId: '019c2f66-a1f4-7000-8000-000000000004',
          evidenceRevision: 3,
          evaluatorVersion: '1.0.0',
          trigger: 'EVIDENCE_CHANGED',
          status: 'READY',
          evaluatedAt: new Date('2026-08-27T12:00:00.000Z'),
          policyVersion: { id: '019c2f66-a1f4-7000-8000-000000000004', version: 1 },
          gateEvaluations: [],
          waivers: [],
        },
      },
      4,
    );

    expect(response).toMatchObject({
      state: 'failed',
      targetEvidenceRevision: 4,
      targetEvaluatorVersion: '1.0.0',
      currentEvidenceRevision: 4,
      failureCode: 'evaluation_retries_exhausted',
      decision: { evidenceRevision: 3 },
    });
  });
});
