import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectInfiniteQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { WorkspaceApi } from '../../data-access/workspace-api';

@Component({
  selector: 'app-result-history',
  imports: [DatePipe, RouterLink, TranslocoPipe],
  templateUrl: './result-history.html',
  styleUrl: './result-history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultHistory {
  private readonly route = inject(ActivatedRoute);
  private readonly workspaceApi = inject(WorkspaceApi);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly runId = this.route.snapshot.paramMap.get('runId') ?? '';
  readonly itemId = this.route.snapshot.paramMap.get('itemId') ?? '';

  readonly history = injectInfiniteQuery(() => ({
    queryKey: [
      'test-result-history',
      this.workspaceSlug,
      this.projectSlug,
      this.runId,
      this.itemId,
    ],
    queryFn: ({ pageParam }) =>
      this.workspaceApi.testResultHistory(
        this.workspaceSlug,
        this.projectSlug,
        this.runId,
        this.itemId,
        pageParam ?? undefined,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));

  readonly item = computed(() => this.history.data()?.pages[0]?.item ?? null);
  readonly results = computed(
    () => this.history.data()?.pages.flatMap(({ results }) => results) ?? [],
  );

  formatElapsed(elapsedMs: number | null): string {
    if (elapsedMs === null) return '—';
    if (elapsedMs < 1_000) return `${elapsedMs} ms`;
    return `${elapsedMs / 1_000} s`;
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.history.error());
  }
}
