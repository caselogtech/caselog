import type { ReleaseDetailResponse } from '@caselog/schemas';
import type { EvidenceListResponse } from '@caselog/schemas/evidence';
import type {
  CandidateReadinessResponse,
  ReadinessDecisionListResponse,
  ReadinessPolicyListResponse,
  ReadinessPolicyResponse,
} from '@caselog/schemas/readiness';

export const releaseId = '11111111-1111-4111-8111-111111111111';
export const candidateId = '22222222-2222-4222-8222-222222222222';
export const policyId = '33333333-3333-4333-8333-333333333333';
export const policyVersionId = '44444444-4444-4444-8444-444444444444';
export const gateId = '55555555-5555-4555-8555-555555555555';
export const observationId = '66666666-6666-4666-8666-666666666666';
export const decisionId = '77777777-7777-4777-8777-777777777777';

export const releaseDetail: ReleaseDetailResponse = {
  release: {
    id: releaseId,
    key: '2026.08',
    name: 'August release',
    state: 'active',
    environment: {
      id: '88888888-8888-4888-8888-888888888888',
      name: 'Production',
      slug: 'production',
      state: 'active',
    },
    targetDate: '2026-08-31T12:00:00.000Z',
    externalReference: 'REL-100',
    candidateCount: 1,
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-27T12:00:00.000Z',
    activatedAt: '2026-08-21T12:00:00.000Z',
    releasedAt: null,
    cancelledAt: null,
  },
  candidates: [
    {
      id: candidateId,
      sequence: 4,
      label: 'RC-4',
      sourceRevision: '8a4c2f1d7b9e',
      buildIdentifier: 'web-1842',
      artifactDigest: 'sha256:3f19c4a1',
      branch: 'main',
      version: '1.4.0',
      sourceUrl: null,
      createdAt: '2026-08-27T09:02:00.000Z',
      testRuns: [
        {
          testRunId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          name: 'Regression',
          status: 'completed',
          role: 'required',
          linkedAt: '2026-08-27T09:05:00.000Z',
        },
      ],
    },
  ],
  history: [],
};

export const readiness: CandidateReadinessResponse = {
  candidateId,
  assignment: {
    id: '99999999-9999-4999-8999-999999999999',
    candidateId,
    policy: { id: policyId, key: 'production', name: 'Production promotion' },
    policyVersion: { id: policyVersionId, version: 3 },
    assignedAt: '2026-08-27T09:10:00.000Z',
  },
  state: 'current',
  targetEvidenceRevision: 12,
  targetEvaluatorVersion: '1.0.0',
  currentEvidenceRevision: 12,
  failureCode: null,
  decision: {
    id: decisionId,
    candidateId,
    assignmentId: '99999999-9999-4999-8999-999999999999',
    policyVersion: { id: policyVersionId, version: 3 },
    evidenceRevision: 12,
    evaluatorVersion: '1.0.0',
    trigger: 'manual',
    status: 'blocked',
    effectiveDisposition: 'blocked',
    evaluatedAt: '2026-08-27T09:44:00.000Z',
    gates: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        gateId,
        gateKey: 'required-pass-rate',
        position: 0,
        result: 'failed',
        diagnostic: 'none',
        metricKey: 'test.pass_rate',
        metricVersion: '1.0.0',
        dimensions: { testRunRole: 'required' },
        operator: 'gte',
        expected: { type: 'percentage', value: '98' },
        actual: { type: 'percentage', value: '97.8' },
        selectedObservationId: observationId,
        explanationCode: 'comparison_failed',
      },
    ],
    waivers: [],
  },
};

export const evidence: EvidenceListResponse = {
  candidateId,
  candidateRevision: 12,
  items: [
    {
      id: observationId,
      projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      candidateId,
      metricKey: 'test.pass_rate',
      metricVersion: '1.0.0',
      value: { type: 'percentage', value: '97.8' },
      state: 'available',
      dimensions: { testRunRole: 'required' },
      observedAt: '2026-08-27T09:40:00.000Z',
      expiresAt: '2026-08-27T13:40:00.000Z',
      freshness: 'current',
      producer: {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        type: 'native_test_metrics',
        key: 'junit-ingest',
        schemaVersion: 1,
        trust: 'verified',
      },
      source: {
        type: 'test_runs',
        id: 'regression',
        revision: '12',
        url: 'https://example.com/runs/regression',
      },
      details: {},
      supersedesObservationId: null,
      isCurrent: true,
      createdAt: '2026-08-27T09:40:00.000Z',
    },
  ],
  nextCursor: null,
};

export const policy: ReadinessPolicyResponse = {
  policy: {
    id: policyId,
    projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    key: 'production',
    name: 'Production promotion',
    description: 'Production readiness policy',
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-25T12:00:00.000Z',
    versions: [
      {
        id: policyVersionId,
        version: 3,
        state: 'published',
        createdAt: '2026-08-25T12:00:00.000Z',
        publishedAt: '2026-08-25T13:00:00.000Z',
        retiredAt: null,
        gates: [
          {
            id: gateId,
            key: 'required-pass-rate',
            position: 0,
            metricKey: 'test.pass_rate',
            metricVersion: '1.0.0',
            dimensions: { testRunRole: 'required' },
            operator: 'gte',
            expected: { type: 'percentage', value: '98' },
            impact: 'blocking',
            missingEvidenceBehavior: 'block',
            staleEvidenceBehavior: 'unknown',
            minimumTrust: 'authenticated',
          },
        ],
      },
    ],
  },
};

export const policyList: ReadinessPolicyListResponse = {
  items: [
    {
      id: policyId,
      projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      key: 'production',
      name: 'Production promotion',
      description: 'Production readiness policy',
      createdAt: '2026-08-20T12:00:00.000Z',
      updatedAt: '2026-08-25T12:00:00.000Z',
      draftVersion: null,
      publishedVersion: {
        id: policyVersionId,
        version: 3,
        state: 'published',
        gateCount: 1,
        createdAt: '2026-08-25T12:00:00.000Z',
        publishedAt: '2026-08-25T13:00:00.000Z',
      },
    },
  ],
  nextCursor: null,
};

export const history: ReadinessDecisionListResponse = {
  items: readiness.decision ? [readiness.decision] : [],
  nextCursor: null,
};
