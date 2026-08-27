import {
  evidenceDiagnostic,
  evidenceExplorerQueryParams,
  parseEvidenceExplorerState,
  toEvidenceListQuery,
} from '../../domain/evidence-explorer';
import { evidence } from '../fixtures/readiness-fixtures';

describe('evidence explorer domain', () => {
  it('parses supported URL filters and rejects invalid cursor values', () => {
    const params = new URLSearchParams({
      candidateId: evidence.candidateId,
      metricKey: 'test.pass_rate',
      producerKey: 'caselog.test-runs',
      sourceType: 'release_candidate_test_runs',
      trust: 'verified',
      freshness: 'stale',
      state: 'available',
      view: 'history',
      observedAfter: '2026-08-20',
      observedBefore: '2026-08-27',
      cursor: 'not-a-uuid',
    });

    expect(parseEvidenceExplorerState((name) => params.get(name))).toEqual({
      filters: {
        candidateId: evidence.candidateId,
        metricKey: 'test.pass_rate',
        producerKey: 'caselog.test-runs',
        sourceType: 'release_candidate_test_runs',
        trust: 'verified',
        freshness: 'stale',
        state: 'available',
        currentOnly: false,
        observedAfter: '2026-08-20',
        observedBefore: '2026-08-27',
      },
      cursor: null,
    });
  });

  it('builds exact API and URL query representations', () => {
    const filters = {
      candidateId: evidence.candidateId,
      metricKey: 'test.failed_count' as const,
      producerKey: ' caselog.test-runs ',
      sourceType: 'release_candidate_test_runs',
      trust: 'verified' as const,
      freshness: 'current' as const,
      state: 'available' as const,
      currentOnly: false,
      observedAfter: '2026-08-20',
      observedBefore: '2026-08-27',
    };

    expect(toEvidenceListQuery(filters)).toMatchObject({
      candidateId: evidence.candidateId,
      producerKey: 'caselog.test-runs',
      currentOnly: false,
      observedAfter: '2026-08-20T00:00:00.000Z',
      observedBefore: '2026-08-27T23:59:59.999Z',
      limit: 25,
    });
    expect(evidenceExplorerQueryParams(filters)).toMatchObject({
      candidateId: evidence.candidateId,
      view: 'history',
      observedAfter: '2026-08-20',
    });
  });

  it('distinguishes observation-level troubleshooting states deterministically', () => {
    const observation = required(evidence.items[0]);
    expect(evidenceDiagnostic(observation).labelKey).toContain('healthy');
    expect(evidenceDiagnostic({ ...observation, state: 'incomplete' }).labelKey).toContain(
      'incomplete',
    );
    expect(evidenceDiagnostic({ ...observation, freshness: 'stale' }).labelKey).toContain('stale');
    expect(
      evidenceDiagnostic({
        ...observation,
        producer: { ...observation.producer, trust: 'unverified' },
      }).labelKey,
    ).toContain('unverified');
    expect(evidenceDiagnostic({ ...observation, isCurrent: false }).labelKey).toContain(
      'superseded',
    );
  });
});

function required<T>(value: T | undefined): T {
  if (!value) throw new Error('Expected an evidence fixture');
  return value;
}
