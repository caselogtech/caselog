import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ReleaseState } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectInfiniteQuery } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { labelFromSlug } from '../../../../shared/models/slug-label';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import { enumQueryParam } from '../../../../shared/routing/query-param';
import {
  Breadcrumbs,
  Button,
  LoadingSkeleton,
  PageState,
  StatusBadge,
} from '../../../../shared/ui/public-api';
import { ReleasesApi } from '../../data-access/releases-api';
import {
  type ReleaseListItem,
  releaseLifecyclePresentation,
  releaseReadinessPresentation,
} from '../../domain/release-list-presentation';

@Component({
  selector: 'app-release-list',
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
  templateUrl: './release-list.html',
  styleUrl: './release-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly releasesApi = inject(ReleasesApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly projectLabel = labelFromSlug(this.projectSlug);
  readonly lifecycleOptions: ReleaseState[] = ['draft', 'active', 'released', 'cancelled'];
  readonly state = computed(() =>
    enumQueryParam(this.queryParams().get('state'), this.lifecycleOptions),
  );
  readonly canManage = computed(() => hasWorkspacePermission(this.workspaceSession.role(), 'lead'));

  readonly releases = injectInfiniteQuery(() => ({
    queryKey: ['release-readiness', this.workspaceSlug, this.projectSlug, this.state()],
    queryFn: ({ pageParam }) =>
      this.releasesApi.listReadiness(
        this.workspaceSlug,
        this.projectSlug,
        pageParam ?? undefined,
        this.state(),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));

  readonly items = computed(() => this.releases.data()?.pages.flatMap(({ items }) => items) ?? []);

  async selectState(state?: ReleaseState): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { state: state ?? null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  lifecycle(item: ReleaseListItem) {
    return releaseLifecyclePresentation(item.release.state);
  }

  lifecycleState(state: ReleaseState) {
    return releaseLifecyclePresentation(state);
  }

  readiness(item: ReleaseListItem) {
    return releaseReadinessPresentation(item);
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.releases.error());
  }
}
