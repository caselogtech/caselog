import { createHash } from 'node:crypto';
import type { CandidateTestRunRole, TestCasePriority } from '@caselog/schemas';
import type { TestRunEvidenceSnapshot } from '../../../test-runs/public-api';
import type { CandidateTestScope } from '../models/candidate-test-scope';
import {
  buildNativeTestMetrics,
  nativeTestPercentage,
  type NativeTestMetricObservation,
} from '../models/native-test-metric';

const RANK: Record<TestCasePriority, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function buildScopedTestMetrics(
  role: CandidateTestRunRole,
  snapshots: TestRunEvidenceSnapshot[],
  scope: CandidateTestScope,
): NativeTestMetricObservation[] {
  const results = new Map<string, NonNullable<TestRunEvidenceSnapshot['items']>[number]>();
  for (const snapshot of [...snapshots].sort((a, b) => a.testRunId.localeCompare(b.testRunId))) {
    for (const item of snapshot.items ?? []) {
      const previous = results.get(item.versionId);
      if (!previous || item.updatedAt > previous.updatedAt) results.set(item.versionId, item);
    }
  }
  const scopeHash = createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  return (Object.keys(RANK) as TestCasePriority[]).flatMap((minimumPriority) => {
    const required = scope.cases.filter((item) => RANK[item.priority] >= RANK[minimumPriority]);
    const selected = required.flatMap((item) => {
      const result = results.get(item.versionId);
      return result ? [result] : [];
    });
    const executed = selected.filter((item) => item.isFinal && item.statusKey !== 'skipped');
    const passed = executed.filter((item) => item.statusKey === 'passed').length;
    const failed = selected.filter((item) => item.countsAsFailure).length;
    const dimensions = { testRunRole: role, minimumPriority };
    const dimensionsHash = createHash('sha256').update(JSON.stringify(dimensions)).digest('hex');
    const missing = required.filter((item) => !results.has(item.versionId));
    const synthetic: TestRunEvidenceSnapshot = {
      projectId: snapshots[0]?.projectId ?? '',
      testRunId: snapshots[0]?.testRunId ?? '',
      status: snapshots.every((item) => ['completed', 'archived'].includes(item.status))
        ? 'completed'
        : 'active',
      revision: 0,
      observedAt: scope.capturedAt,
      totalItems: required.length,
      finalItems: executed.length,
      passedItems: passed,
      failedItems: failed,
      skippedItems: 0,
      statusCounts: [],
    };
    return buildNativeTestMetrics(role, snapshots.length ? [synthetic] : []).map((metric) => ({
      ...metric,
      dimensions,
      dimensionsHash,
      // A passing subset never supplies a passing rate for the full required scope.
      percentageValue:
        metric.metricKey === 'test.pass_rate' && required.length
          ? nativeTestPercentage(passed, required.length)
          : metric.percentageValue,
      state:
        required.length === 0 ||
        snapshots.length === 0 ||
        (metric.metricKey === 'test.failed_count' && executed.length !== required.length) ||
        snapshots.some((item) => !['completed', 'archived'].includes(item.status))
          ? 'incomplete'
          : 'available',
      payload: {
        ...metric.payload,
        runCount: snapshots.length,
        runRevisions: [...snapshots]
          .sort((a, b) => a.testRunId.localeCompare(b.testRunId))
          .slice(0, 100)
          .map((run) => ({ testRunId: run.testRunId, revision: run.revision })),
        runRevisionsTruncated: snapshots.length > 100,
        scopeCapturedAt: scope.capturedAt,
        scopeHash,
        requiredCaseCount: required.length,
        missingCaseCount: missing.length,
        missingCaseIds: missing.slice(0, 100).map((item) => item.caseId),
        missingCaseIdsTruncated: missing.length > 100,
      },
    }));
  });
}
