import { describe, expect, it } from 'vitest';
import { updateReleaseRequestSchema } from '@caselog/schemas';
import {
  planReleaseUpdate,
  type ReleaseUpdateSnapshot,
} from '../../domain/policies/release-update.policy';

const current: ReleaseUpdateSnapshot = {
  name: 'Release',
  environmentId: null,
  targetDate: null,
  externalReference: null,
  state: 'draft',
  updatedAt: '2026-11-21T10:00:00.000Z',
};
const request = {
  name: 'Release',
  environmentId: null,
  targetDate: null,
  externalReference: null,
  expectedUpdatedAt: current.updatedAt,
};

describe('release metadata edits', () => {
  it.each(['draft', 'active'] as const)('allows metadata edits in %s', (state) => {
    expect(planReleaseUpdate({ ...current, state }, { ...request, name: 'Renamed' })).toEqual({
      kind: 'update',
      changedFields: ['name'],
    });
  });
  it.each(['released', 'cancelled'] as const)(
    'keeps %s read-only even for identical requests',
    (state) => {
      expect(planReleaseUpdate({ ...current, state }, request)).toEqual({ kind: 'finalized' });
    },
  );
  it('rejects stale changes but permits an identical retry', () => {
    const stale = { ...request, expectedUpdatedAt: '2026-11-20T10:00:00.000Z' };
    expect(planReleaseUpdate(current, { ...stale, name: 'Other' })).toEqual({ kind: 'stale' });
    expect(planReleaseUpdate(current, stale)).toEqual({ kind: 'unchanged' });
  });
  it('normalizes precision without changing the target instant', () => {
    expect(
      planReleaseUpdate(
        { ...current, targetDate: '2026-11-22T12:00:00.000Z' },
        { ...request, targetDate: '2026-11-22T12:00:00Z' },
      ),
    ).toEqual({ kind: 'unchanged' });
  });
  it('validates bounds and rejects identity and lifecycle writes', () => {
    expect(
      updateReleaseRequestSchema.parse({ ...request, name: ' Release ', externalReference: ' ' }),
    ).toEqual(request);
    for (const extra of [{ key: 'different' }, { state: 'released' }, { candidateId: 'id' }])
      expect(updateReleaseRequestSchema.safeParse({ ...request, ...extra }).success).toBe(false);
    for (const invalid of [
      { name: ' ' },
      { name: 'a'.repeat(201) },
      { expectedUpdatedAt: undefined },
      { targetDate: 'invalid' },
      { externalReference: 'a'.repeat(2049) },
    ])
      expect(updateReleaseRequestSchema.safeParse({ ...request, ...invalid }).success).toBe(false);
  });
});
