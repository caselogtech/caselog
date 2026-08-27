import { evidenceListQuerySchema } from '@caselog/schemas/evidence';
import { describe, expect, it } from 'vitest';

describe('evidence list query', () => {
  it('parses bounded server-side explorer filters', () => {
    expect(
      evidenceListQuerySchema.parse({
        candidateId: '22222222-2222-4222-8222-222222222222',
        metricKey: 'test.pass_rate',
        producerKey: 'caselog.test-runs',
        sourceType: 'release_candidate_test_runs',
        trust: 'verified',
        freshness: 'current',
        state: 'available',
        observedAfter: '2026-08-20T00:00:00.000Z',
        observedBefore: '2026-08-27T23:59:59.999Z',
        currentOnly: 'false',
      }),
    ).toMatchObject({
      producerKey: 'caselog.test-runs',
      trust: 'verified',
      currentOnly: false,
      limit: 25,
    });
  });

  it('rejects inverted observation time ranges', () => {
    expect(() =>
      evidenceListQuerySchema.parse({
        candidateId: '22222222-2222-4222-8222-222222222222',
        observedAfter: '2026-08-27T00:00:00.000Z',
        observedBefore: '2026-08-20T23:59:59.999Z',
      }),
    ).toThrow();
  });
});
