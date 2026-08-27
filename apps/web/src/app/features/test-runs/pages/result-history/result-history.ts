import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectInfiniteQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { Button, LoadingSkeleton, PageState } from '../../../../shared/ui/public-api';
import { ResultAttemptList } from '../../components/result-attempt-list/result-attempt-list';
import { TestRunsApi } from '../../data-access/test-runs-api';

@Component({
  selector: 'app-result-history',
  imports: [Button, LoadingSkeleton, PageState, ResultAttemptList, RouterLink, TranslocoPipe],
  templateUrl: './result-history.html',
  styleUrl: './result-history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultHistory {
  private readonly route = inject(ActivatedRoute);
  private readonly testRunsApi = inject(TestRunsApi);

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
      this.testRunsApi.testResultHistory(
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

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.history.error());
  }
}
