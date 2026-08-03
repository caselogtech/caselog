import type {
  ResultStatusResponse,
  RunMemberResponse,
  RunProgressResponse,
  TestRunSummary,
} from '@caselog/schemas';

type ProgressStatus = ResultStatusResponse & { position: number };

export type RunProgressSource = {
  project: RunProgressResponse['project'];
  run: Omit<TestRunSummary, 'itemCount' | 'completedCount' | 'failedCount'>;
  statuses: ProgressStatus[];
  items: Array<{
    status: ResultStatusResponse;
    assignee: RunMemberResponse | null;
    suite: { id: string; name: string };
  }>;
};

type ProgressCounts = {
  itemCount: number;
  completedCount: number;
  failedCount: number;
};

function percentage(value: number, total: number): number {
  return total === 0 ? 0 : Math.round((value / total) * 1_000) / 10;
}

function addItem(counts: ProgressCounts, status: ResultStatusResponse): void {
  counts.itemCount += 1;
  if (status.isFinal) counts.completedCount += 1;
  if (status.countsAsFailure) counts.failedCount += 1;
}

export function buildRunProgress(source: RunProgressSource): RunProgressResponse {
  const itemCount = source.items.length;
  const completedCount = source.items.filter(({ status }) => status.isFinal).length;
  const failedCount = source.items.filter(({ status }) => status.countsAsFailure).length;
  const successfulCount = source.items.filter(
    ({ status }) => status.isFinal && !status.countsAsFailure,
  ).length;

  const statusById = new Map(source.statuses.map((status) => [status.id, { status, count: 0 }]));
  for (const item of source.items) {
    const group = statusById.get(item.status.id) ?? {
      status: { ...item.status, position: 0 },
      count: 0,
    };
    group.count += 1;
    statusById.set(item.status.id, group);
  }

  const assigneeById = new Map<
    string,
    { assignee: RunMemberResponse | null; counts: ProgressCounts }
  >();
  const suiteById = new Map<
    string,
    { suite: { id: string; name: string }; counts: ProgressCounts }
  >();
  for (const item of source.items) {
    const assigneeId = item.assignee?.id ?? '';
    const assignee = assigneeById.get(assigneeId) ?? {
      assignee: item.assignee,
      counts: { itemCount: 0, completedCount: 0, failedCount: 0 },
    };
    addItem(assignee.counts, item.status);
    assigneeById.set(assigneeId, assignee);

    const suite = suiteById.get(item.suite.id) ?? {
      suite: item.suite,
      counts: { itemCount: 0, completedCount: 0, failedCount: 0 },
    };
    addItem(suite.counts, item.status);
    suiteById.set(item.suite.id, suite);
  }

  return {
    project: source.project,
    run: { ...source.run, itemCount, completedCount, failedCount },
    progressPercent: percentage(completedCount, itemCount),
    passRate: completedCount === 0 ? null : percentage(successfulCount, completedCount),
    successfulCount,
    incompleteCount: itemCount - completedCount,
    statuses: [...statusById.values()]
      .sort((left, right) => left.status.position - right.status.position)
      .map(({ status: { position: _, ...status }, count }) => ({
        status,
        count,
        percentage: percentage(count, itemCount),
      })),
    assignees: [...assigneeById.values()]
      .sort((left, right) => {
        if (!left.assignee) return 1;
        if (!right.assignee) return -1;
        return left.assignee.displayName.localeCompare(right.assignee.displayName);
      })
      .map(({ assignee, counts }) => ({ assignee, ...counts })),
    suites: [...suiteById.values()]
      .sort((left, right) => left.suite.name.localeCompare(right.suite.name))
      .map(({ suite, counts }) => ({ suite, ...counts })),
  };
}
