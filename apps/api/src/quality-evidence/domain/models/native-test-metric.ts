import { createHash } from 'node:crypto';
import type { CandidateTestRunRole } from '@caselog/schemas';
import type { TestRunEvidenceSnapshot } from '../../../test-runs/public-api';

export const NATIVE_TEST_METRIC = {
  passRate: 'test.pass_rate',
  completionRate: 'test.completion_rate',
  failedCount: 'test.failed_count',
} as const;

export const NATIVE_TEST_METRIC_VERSION = '1.0.0';
export const NATIVE_TEST_PRODUCER = {
  type: 'native_test_runs',
  key: 'caselog.test-runs',
  schemaVersion: 1,
  freshnessSeconds: 86_400,
} as const;

export type NativeTestMetricKey = (typeof NATIVE_TEST_METRIC)[keyof typeof NATIVE_TEST_METRIC];

export type NativeTestMetricObservation = {
  metricKey: NativeTestMetricKey;
  metricVersion: typeof NATIVE_TEST_METRIC_VERSION;
  valueType: 'percentage' | 'integer';
  state: 'available' | 'incomplete';
  percentageValue: string | null;
  integerValue: number | null;
  dimensions: { testRunRole: CandidateTestRunRole };
  dimensionsHash: string;
  payload: NativeTestMetricPayload;
};

export type NativeTestMetricPayload = {
  runCount: number;
  totalItems: number;
  finalItems: number;
  executedFinalItems: number;
  passedItems: number;
  failedItems: number;
  skippedItems: number;
  incompleteRunIds: string[];
  runRevisions: Array<{ testRunId: string; revision: number }>;
  runRevisionsTruncated: boolean;
};

export function buildNativeTestMetrics(
  role: CandidateTestRunRole,
  snapshots: TestRunEvidenceSnapshot[],
): NativeTestMetricObservation[] {
  const totals = snapshots.reduce(
    (result, snapshot) => ({
      totalItems: result.totalItems + snapshot.totalItems,
      finalItems: result.finalItems + snapshot.finalItems,
      passedItems: result.passedItems + snapshot.passedItems,
      failedItems: result.failedItems + snapshot.failedItems,
      skippedItems: result.skippedItems + snapshot.skippedItems,
    }),
    { totalItems: 0, finalItems: 0, passedItems: 0, failedItems: 0, skippedItems: 0 },
  );
  const executedFinalItems = Math.max(totals.finalItems - totals.skippedItems, 0);
  const incompleteRunIds = snapshots
    .filter(({ status }) => status !== 'completed' && status !== 'archived')
    .map(({ testRunId }) => testRunId)
    .sort();
  const sourceIncomplete = snapshots.length === 0 || incompleteRunIds.length > 0;
  const runRevisions = snapshots
    .map(({ testRunId, revision }) => ({ testRunId, revision }))
    .sort((left, right) => left.testRunId.localeCompare(right.testRunId));
  const payload: NativeTestMetricPayload = {
    runCount: snapshots.length,
    ...totals,
    executedFinalItems,
    incompleteRunIds,
    runRevisions: runRevisions.slice(0, 100),
    runRevisionsTruncated: runRevisions.length > 100,
  };
  const dimensions = { testRunRole: role };
  const dimensionsHash = hashJson(dimensions);

  return [
    {
      metricKey: NATIVE_TEST_METRIC.passRate,
      metricVersion: NATIVE_TEST_METRIC_VERSION,
      valueType: 'percentage',
      state: sourceIncomplete || executedFinalItems === 0 ? 'incomplete' : 'available',
      percentageValue:
        executedFinalItems === 0 ? null : percentage(totals.passedItems, executedFinalItems),
      integerValue: null,
      dimensions,
      dimensionsHash,
      payload,
    },
    {
      metricKey: NATIVE_TEST_METRIC.completionRate,
      metricVersion: NATIVE_TEST_METRIC_VERSION,
      valueType: 'percentage',
      state: sourceIncomplete || totals.totalItems === 0 ? 'incomplete' : 'available',
      percentageValue:
        totals.totalItems === 0 ? null : percentage(totals.finalItems, totals.totalItems),
      integerValue: null,
      dimensions,
      dimensionsHash,
      payload,
    },
    {
      metricKey: NATIVE_TEST_METRIC.failedCount,
      metricVersion: NATIVE_TEST_METRIC_VERSION,
      valueType: 'integer',
      state: sourceIncomplete ? 'incomplete' : 'available',
      percentageValue: null,
      integerValue: totals.failedItems,
      dimensions,
      dimensionsHash,
      payload,
    },
  ];
}

export function nativeTestSourceRevision(
  candidateIdentityHash: string,
  role: CandidateTestRunRole,
  snapshots: TestRunEvidenceSnapshot[],
): string {
  return hashJson({
    candidateIdentityHash,
    role,
    runs: snapshots
      .map(({ testRunId, revision, status }) => ({ testRunId, revision, status }))
      .sort((left, right) => left.testRunId.localeCompare(right.testRunId)),
  });
}

function percentage(numerator: number, denominator: number): string {
  const scale = 1_000_000_000n;
  const scaled =
    (BigInt(numerator) * 100n * scale + BigInt(denominator) / 2n) / BigInt(denominator);
  const integer = scaled / scale;
  const fraction = (scaled % scale).toString().padStart(9, '0');
  return `${integer}.${fraction}`;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
