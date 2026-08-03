import { describe, expect, it } from 'vitest';
import type { ResultStatusResponse } from '@caselog/schemas';
import { buildRunProgress, type RunProgressSource } from '../../domain/calculations/run-progress';

const PROJECT_ID = 'a1000000-0000-4000-8000-000000000001';
const RUN_ID = 'a1000000-0000-4000-8000-000000000002';
const PASSED_ID = 'a1000000-0000-4000-8000-000000000003';
const FAILED_ID = 'a1000000-0000-4000-8000-000000000004';
const UNTESTED_ID = 'a1000000-0000-4000-8000-000000000005';
const USER_ID = 'a1000000-0000-4000-8000-000000000006';
const SUITE_ID = 'a1000000-0000-4000-8000-000000000007';

function status(
  id: string,
  key: string,
  isFinal: boolean,
  countsAsFailure: boolean,
): ResultStatusResponse & { position: number } {
  return {
    id,
    key,
    name: key[0]?.toUpperCase() + key.slice(1),
    color: '#64748B',
    isFinal,
    countsAsFailure,
    position: key === 'untested' ? 0 : key === 'passed' ? 1 : 2,
  };
}

const statuses = [
  status(UNTESTED_ID, 'untested', false, false),
  status(PASSED_ID, 'passed', true, false),
  status(FAILED_ID, 'failed', true, true),
];

function source(items: RunProgressSource['items']): RunProgressSource {
  return {
    project: { id: PROJECT_ID, key: 'AUTH', slug: 'auth', name: 'Authentication' },
    run: {
      id: RUN_ID,
      name: 'Regression',
      status: 'active',
      build: 'rc-1',
      createdAt: '2026-08-03T10:00:00.000Z',
      closedAt: null,
    },
    statuses,
    items,
  };
}

describe('buildRunProgress', () => {
  it('calculates status, assignee, and suite progress', () => {
    const suite = { id: SUITE_ID, name: 'Authentication' };
    const assignee = { id: USER_ID, displayName: 'Ada Tester' };
    const result = buildRunProgress(
      source([
        { status: statuses[1] as ResultStatusResponse, assignee, suite },
        { status: statuses[2] as ResultStatusResponse, assignee: null, suite },
        {
          status: statuses[0] as ResultStatusResponse,
          assignee: null,
          suite: { id: 'a1000000-0000-4000-8000-000000000008', name: 'Checkout' },
        },
      ]),
    );

    expect(result).toMatchObject({
      progressPercent: 66.7,
      passRate: 50,
      successfulCount: 1,
      incompleteCount: 1,
      run: { itemCount: 3, completedCount: 2, failedCount: 1 },
    });
    expect(
      result.statuses.map(({ status: itemStatus, count, percentage }) => ({
        key: itemStatus.key,
        count,
        percentage,
      })),
    ).toEqual([
      { key: 'untested', count: 1, percentage: 33.3 },
      { key: 'passed', count: 1, percentage: 33.3 },
      { key: 'failed', count: 1, percentage: 33.3 },
    ]);
    expect(result.assignees).toEqual([
      { assignee, itemCount: 1, completedCount: 1, failedCount: 0 },
      { assignee: null, itemCount: 2, completedCount: 1, failedCount: 1 },
    ]);
    expect(result.suites).toEqual([
      { suite, itemCount: 2, completedCount: 2, failedCount: 1 },
      {
        suite: { id: 'a1000000-0000-4000-8000-000000000008', name: 'Checkout' },
        itemCount: 1,
        completedCount: 0,
        failedCount: 0,
      },
    ]);
  });

  it('returns zero progress and no pass rate for an empty run', () => {
    expect(buildRunProgress(source([]))).toMatchObject({
      progressPercent: 0,
      passRate: null,
      successfulCount: 0,
      incompleteCount: 0,
      run: { itemCount: 0, completedCount: 0, failedCount: 0 },
    });
  });
});
