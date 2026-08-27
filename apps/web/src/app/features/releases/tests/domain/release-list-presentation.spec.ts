import type { ReleaseReadinessListResponse } from '@caselog/schemas';
import {
  releaseLifecyclePresentation,
  releaseReadinessPresentation,
} from '../../domain/release-list-presentation';

const baseItem: ReleaseReadinessListResponse['items'][number] = {
  release: {
    id: '11111111-1111-4111-8111-111111111111',
    key: 'AUTH-2026.08',
    name: 'Authentication August release',
    state: 'active',
    environment: null,
    targetDate: null,
    externalReference: null,
    candidateCount: 1,
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-27T12:00:00.000Z',
    activatedAt: '2026-08-21T12:00:00.000Z',
    releasedAt: null,
    cancelledAt: null,
  },
  latestCandidate: {
    id: '22222222-2222-4222-8222-222222222222',
    releaseId: '11111111-1111-4111-8111-111111111111',
    sequence: 1,
    label: 'RC-1',
    createdAt: '2026-08-21T12:00:00.000Z',
  },
  readiness: {
    state: 'current',
    decisionId: '33333333-3333-4333-8333-333333333333',
    computedStatus: 'blocked',
    effectiveDisposition: 'approved_with_waiver',
    policy: {
      id: '44444444-4444-4444-8444-444444444444',
      key: 'production',
      name: 'Production readiness',
      version: 2,
    },
    evidenceRevision: 3,
    targetEvidenceRevision: 3,
    currentEvidenceRevision: 3,
    evaluatorVersion: '1.0.0',
    evaluatedAt: '2026-08-27T12:00:00.000Z',
    failureCode: null,
  },
};

describe('release list presentation', () => {
  it('maps lifecycle states to semantic badge presentations', () => {
    expect(releaseLifecyclePresentation('released')).toEqual({
      labelKey: 'releases.lifecycle.released',
      tone: 'success',
    });
    expect(releaseLifecyclePresentation('cancelled').tone).toBe('danger');
  });

  it('keeps an effective waiver distinct from the blocked computed status', () => {
    expect(releaseReadinessPresentation(baseItem)).toEqual({
      labelKey: 'releases.readiness.approvedWithWaiver',
      tone: 'warning',
    });
  });

  it('prioritizes projection freshness and failure over a previous disposition', () => {
    const readiness = baseItem.readiness;
    if (!readiness) throw new Error('Expected the fixture to include readiness');
    expect(
      releaseReadinessPresentation({
        ...baseItem,
        readiness: { ...readiness, state: 'stale' },
      }),
    ).toEqual({ labelKey: 'releases.readiness.stale', tone: 'warning' });
    expect(
      releaseReadinessPresentation({
        ...baseItem,
        readiness: { ...readiness, state: 'failed' },
      }).tone,
    ).toBe('danger');
  });

  it('distinguishes missing candidates from missing policy assignments', () => {
    expect(
      releaseReadinessPresentation({ ...baseItem, latestCandidate: null, readiness: null })
        .labelKey,
    ).toBe('releases.readiness.noCandidate');
    expect(releaseReadinessPresentation({ ...baseItem, readiness: null }).labelKey).toBe(
      'releases.readiness.noPolicy',
    );
  });
});
