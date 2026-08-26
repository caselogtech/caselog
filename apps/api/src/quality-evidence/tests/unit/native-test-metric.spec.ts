import type { TestRunEvidenceSnapshot } from '../../../test-runs/public-api';
import { describe, expect, it } from 'vitest';
import {
  buildNativeTestMetrics,
  nativeTestSourceRevision,
} from '../../domain/models/native-test-metric';

describe('native test metrics', () => {
  it('calculates exact role-scoped metrics and excludes skipped items from pass rate', () => {
    const metrics = buildNativeTestMetrics('required', [
      snapshot({
        totalItems: 5,
        finalItems: 4,
        passedItems: 2,
        failedItems: 1,
        skippedItems: 1,
      }),
    ]);

    expect(metrics).toEqual([
      expect.objectContaining({
        metricKey: 'test.pass_rate',
        state: 'available',
        percentageValue: '66.666666667',
      }),
      expect.objectContaining({
        metricKey: 'test.completion_rate',
        state: 'available',
        percentageValue: '80.000000000',
      }),
      expect.objectContaining({
        metricKey: 'test.failed_count',
        state: 'available',
        integerValue: 1,
      }),
    ]);
  });

  it('marks empty and active sources incomplete instead of manufacturing a pass', () => {
    const empty = buildNativeTestMetrics('required', []);
    expect(empty.map(({ state }) => state)).toEqual(['incomplete', 'incomplete', 'incomplete']);
    expect(empty[0]?.percentageValue).toBeNull();
    expect(empty[2]?.integerValue).toBe(0);

    const active = buildNativeTestMetrics('required', [snapshot({ status: 'active' })]);
    expect(active.every(({ state }) => state === 'incomplete')).toBe(true);
  });

  it('applies the v1 mapping to already-collapsed current and custom final statuses', () => {
    const metrics = buildNativeTestMetrics('required', [
      snapshot({
        totalItems: 4,
        finalItems: 4,
        passedItems: 2,
        failedItems: 1,
        skippedItems: 0,
        statusCounts: [
          { key: 'passed', isFinal: true, countsAsFailure: false, count: 2 },
          { key: 'failed', isFinal: true, countsAsFailure: true, count: 1 },
          { key: 'accepted_with_risk', isFinal: true, countsAsFailure: false, count: 1 },
        ],
      }),
    ]);

    expect(metrics).toEqual([
      expect.objectContaining({ metricKey: 'test.pass_rate', percentageValue: '50.000000000' }),
      expect.objectContaining({
        metricKey: 'test.completion_rate',
        percentageValue: '100.000000000',
      }),
      expect.objectContaining({ metricKey: 'test.failed_count', integerValue: 1 }),
    ]);
  });

  it('uses run identity, revision, lifecycle and role in a stable source revision', () => {
    const first = snapshot({ testRunId: 'run-a', revision: 2 });
    const second = snapshot({ testRunId: 'run-b', revision: 3 });
    expect(nativeTestSourceRevision('candidate', 'required', [first, second])).toBe(
      nativeTestSourceRevision('candidate', 'required', [second, first]),
    );
    expect(nativeTestSourceRevision('candidate', 'required', [first])).not.toBe(
      nativeTestSourceRevision('candidate', 'informational', [first]),
    );
    expect(nativeTestSourceRevision('candidate', 'required', [first])).not.toBe(
      nativeTestSourceRevision('candidate', 'required', [{ ...first, revision: 3 }]),
    );
  });
});

function snapshot(overrides: Partial<TestRunEvidenceSnapshot> = {}): TestRunEvidenceSnapshot {
  return {
    projectId: 'project-id',
    testRunId: 'run-id',
    status: 'completed',
    revision: 1,
    observedAt: '2026-08-26T12:00:00.000Z',
    totalItems: 3,
    finalItems: 3,
    passedItems: 2,
    failedItems: 1,
    skippedItems: 0,
    statusCounts: [],
    ...overrides,
  };
}
