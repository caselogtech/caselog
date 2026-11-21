import { describe, expect, it } from 'vitest';
import type { ReleaseSummary } from '@caselog/schemas';
import { releaseEditRequest, validReleaseDate } from '../../domain/release-edit-form';

const release: ReleaseSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  key: 'R-1',
  name: 'Release',
  state: 'draft',
  environment: null,
  targetDate: '2026-11-22T03:17:42.123Z',
  externalReference: null,
  candidateCount: 0,
  createdAt: '2026-11-21T12:00:00.000Z',
  updatedAt: '2026-11-21T12:00:00.000Z',
  activatedAt: null,
  releasedAt: null,
  cancelledAt: null,
};

describe('release edit form mapping', () => {
  it('preserves an unchanged target instant, clears optional fields and trims text', () => {
    expect(
      releaseEditRequest(
        { name: ' Renamed ', environmentId: '', targetDate: '2026-11-22', externalReference: ' ' },
        release,
      ),
    ).toEqual({
      name: 'Renamed',
      environmentId: null,
      targetDate: release.targetDate,
      externalReference: null,
      expectedUpdatedAt: release.updatedAt,
    });
    expect(
      releaseEditRequest(
        { name: 'Release', environmentId: '', targetDate: '', externalReference: '' },
        release,
      ).targetDate,
    ).toBeNull();
    expect(
      releaseEditRequest(
        { name: 'Release', environmentId: '', targetDate: '2026-12-01', externalReference: '' },
        release,
      ).targetDate,
    ).toBe('2026-12-01T12:00:00.000Z');
  });
  it('accepts empty and valid calendar dates but rejects malformed and overflowing dates', () => {
    for (const date of ['', '2028-02-29', '2026-12-01']) expect(validReleaseDate(date)).toBe(true);
    for (const date of ['2026-02-29', '2026-04-31', 'invalid', '2026-1-1'])
      expect(validReleaseDate(date)).toBe(false);
  });
});
