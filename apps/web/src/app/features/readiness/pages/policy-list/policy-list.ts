import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectInfiniteQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { Button, LoadingSkeleton, PageState } from '../../../../shared/ui/public-api';
import { PolicyCatalog } from '../../components/policy-catalog/policy-catalog';
import { ReadinessApi } from '../../data-access/readiness-api';

@Component({
  selector: 'app-readiness-policy-list',
  imports: [Button, LoadingSkeleton, PageState, PolicyCatalog, TranslocoPipe],
  templateUrl: './policy-list.html',
  styleUrl: './policy-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadinessPolicyList {
  private readonly route = inject(ActivatedRoute);
  private readonly readinessApi = inject(ReadinessApi);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';

  readonly policies = injectInfiniteQuery(() => ({
    queryKey: ['readiness-policies', this.workspaceSlug, this.projectSlug],
    queryFn: ({ pageParam }) =>
      this.readinessApi.policies(this.workspaceSlug, this.projectSlug, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));
  readonly items = computed(() => this.policies.data()?.pages.flatMap(({ items }) => items) ?? []);

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.policies.error());
  }
}
