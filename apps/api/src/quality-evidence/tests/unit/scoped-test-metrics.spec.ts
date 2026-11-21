import { describe, expect, it } from 'vitest';
import type { TestRunEvidenceSnapshot } from '../../../test-runs/public-api';
import type { CandidateTestScope } from '../../domain/models/candidate-test-scope';
import { buildScopedTestMetrics } from '../../domain/policies/scoped-test-metrics';

const scope: CandidateTestScope = {
  capturedAt: '2026-11-21T10:00:00.000Z',
  cases: [
    { caseId: 'high', versionId: 'high-v1', priority: 'high' },
    { caseId: 'medium', versionId: 'medium-v1', priority: 'medium' },
    { caseId: 'low', versionId: 'low-v1', priority: 'low' },
  ],
};
function run(
  items: NonNullable<TestRunEvidenceSnapshot['items']>,
  overrides: Partial<TestRunEvidenceSnapshot> = {},
): TestRunEvidenceSnapshot {
  return {
    projectId: 'project',
    testRunId: 'run',
    revision: 1,
    status: 'completed',
    observedAt: scope.capturedAt,
    totalItems: items.length,
    finalItems: items.length,
    passedItems: items.length,
    failedItems: 0,
    skippedItems: 0,
    statusCounts: [],
    items,
    ...overrides,
  };
}
function item(versionId: string, statusKey = 'passed', updatedAt = scope.capturedAt) {
  return {
    versionId,
    statusKey,
    updatedAt,
    isFinal: true,
    countsAsFailure: statusKey === 'failed',
  };
}
function metric(runs: TestRunEvidenceSnapshot[], key = 'test.pass_rate', priority = 'medium') {
  return buildScopedTestMetrics('required', runs, scope).find(
    (value) => value.metricKey === key && value.dimensions.minimumPriority === priority,
  );
}

describe('frozen priority-scoped test metrics', () => {
  it('uses all required versions rather than a passing subset as the denominator', () => {
    const result = metric([run([item('high-v1')])]);
    expect(result).toMatchObject({
      percentageValue: '50.000000000',
      state: 'available',
      payload: { requiredCaseCount: 2, missingCaseCount: 1, missingCaseIds: ['medium'] },
    });
    expect(metric([run([item('high-v1')])], 'test.failed_count')?.state).toBe('incomplete');
  });
  it('ignores lower priorities and cases outside the frozen inventory', () => {
    expect(
      metric([
        run([
          item('high-v1'),
          item('medium-v1'),
          item('low-v1', 'failed'),
          item('new-case', 'failed'),
        ]),
      ])?.percentageValue,
    ).toBe('100.000000000');
  });
  it('deduplicates versions across runs and uses the latest result deterministically', () => {
    const earlier = run([item('high-v1'), item('medium-v1')], { testRunId: 'a' });
    const later = run([item('medium-v1', 'failed', '2026-11-21T11:00:00.000Z')], {
      testRunId: 'b',
    });
    expect(metric([earlier, later])?.percentageValue).toBe('50.000000000');
    expect(metric([later, earlier])).toEqual(metric([earlier, later]));
    expect(metric([earlier, later], 'test.failed_count')?.integerValue).toBe(1);
  });
  it('does not count a different case version or a skipped result as passing or executed', () => {
    const runs = [run([item('high-v2'), item('medium-v1', 'skipped')])];
    expect(metric(runs)?.percentageValue).toBe('0.000000000');
    expect(metric(runs, 'test.completion_rate')?.percentageValue).toBe('0.000000000');
  });
  it('does not establish readiness for an empty scope, missing runs or unfinished runs', () => {
    expect(metric([], 'test.failed_count')?.state).toBe('incomplete');
    expect(metric([run([item('high-v1')], { status: 'active' })])?.state).toBe('incomplete');
    expect(metric([run([])], 'test.failed_count', 'critical')?.state).toBe('incomplete');
  });
});
