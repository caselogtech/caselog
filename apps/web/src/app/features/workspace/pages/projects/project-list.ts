import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectInfiniteQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { WorkspaceApi } from '../../data-access/workspace-api';

@Component({
  selector: 'app-project-list',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './project-list.html',
  styleUrl: './project-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectList {
  private readonly route = inject(ActivatedRoute);
  private readonly workspaceApi = inject(WorkspaceApi);
  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';

  readonly projects = injectInfiniteQuery(() => ({
    queryKey: ['projects', this.workspaceSlug],
    queryFn: ({ pageParam }) =>
      this.workspaceApi.listProjects(this.workspaceSlug, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));

  readonly items = computed(() => this.projects.data()?.pages.flatMap(({ items }) => items) ?? []);

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.projects.error());
  }
}
