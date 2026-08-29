import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { TestRunStatus, TestRunSummary } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectInfiniteQuery } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import { enumQueryParam } from '../../../../shared/routing/query-param';
import {
  Breadcrumbs,
  Button,
  LoadingSkeleton,
  PageState,
  StatusBadge,
  type StatusBadgeTone,
} from '../../../../shared/ui/public-api';
import { TestRunsApi } from '../../data-access/test-runs-api';

const STATUS_TRANSLATION_KEYS: Record<TestRunStatus, string> = {
  draft: 'workspace.runs.statuses.draft',
  active: 'workspace.runs.statuses.active',
  completed: 'workspace.runs.statuses.completed',
  archived: 'workspace.runs.statuses.archived',
};

@Component({
  selector: 'app-run-list',
  imports: [
    Breadcrumbs,
    Button,
    DatePipe,
    LoadingSkeleton,
    PageState,
    RouterLink,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './run-list.html',
  styleUrl: './run-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly testRunsApi = inject(TestRunsApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly statuses: TestRunStatus[] = ['active', 'completed', 'draft', 'archived'];
  readonly status = computed(() => enumQueryParam(this.queryParams().get('status'), this.statuses));
  readonly canCreate = computed(() =>
    hasWorkspacePermission(this.workspaceSession.role(), 'write'),
  );

  readonly runs = injectInfiniteQuery(() => ({
    queryKey: ['test-runs', this.workspaceSlug, this.projectSlug, this.status()],
    queryFn: ({ pageParam }) =>
      this.testRunsApi.listTestRuns(
        this.workspaceSlug,
        this.projectSlug,
        pageParam ?? undefined,
        this.status(),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));

  readonly items = computed(() => this.runs.data()?.pages.flatMap(({ items }) => items) ?? []);
  readonly project = computed(() => this.runs.data()?.pages[0]?.project ?? null);

  async selectStatus(status?: TestRunStatus): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: status ?? null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.runs.error());
  }

  statusTranslationKey(status: TestRunStatus): string {
    return STATUS_TRANSLATION_KEYS[status];
  }

  progressPercent(run: TestRunSummary): number {
    return run.itemCount === 0 ? 0 : Math.round((run.completedCount / run.itemCount) * 100);
  }

  statusTone(status: TestRunStatus): StatusBadgeTone {
    if (status === 'active') return 'pending';
    if (status === 'completed') return 'success';
    return 'neutral';
  }
}
