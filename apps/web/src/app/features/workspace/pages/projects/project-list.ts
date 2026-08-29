import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CreateProjectRequest } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { labelFromSlug } from '../../../../shared/models/slug-label';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import { Breadcrumbs, Button, Callout } from '../../../../shared/ui/public-api';
import { ProjectCreateForm } from '../../components/project-create-form/project-create-form';
import { WorkspaceApi } from '../../data-access/workspace-api';

@Component({
  selector: 'app-project-list',
  imports: [Breadcrumbs, Button, Callout, ProjectCreateForm, RouterLink, TranslocoPipe],
  templateUrl: './project-list.html',
  styleUrl: './project-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly workspaceSlug = computed(() => this.routeParams().get('org') ?? '');
  readonly workspaceLabel = computed(() => labelFromSlug(this.workspaceSlug()));
  readonly createFormOpen = signal(false);
  readonly canManage = computed(() => hasWorkspacePermission(this.workspaceSession.role(), 'lead'));

  readonly projects = injectInfiniteQuery(() => ({
    queryKey: ['projects', this.workspaceSlug()],
    queryFn: ({ pageParam }) =>
      this.workspaceApi.listProjects(this.workspaceSlug(), pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));
  readonly createProject = injectMutation(() => ({
    mutationFn: (request: CreateProjectRequest) =>
      this.workspaceApi.createProject(this.workspaceSlug(), request),
    onSuccess: async ({ project }) => {
      this.createFormOpen.set(false);
      await this.queryClient.invalidateQueries({ queryKey: ['projects', this.workspaceSlug()] });
      await this.router.navigate(['/', this.workspaceSlug(), project.slug, 'cases']);
    },
  }));

  readonly items = computed(() => this.projects.data()?.pages.flatMap(({ items }) => items) ?? []);

  openCreateForm(): void {
    if (!this.canManage()) return;
    this.createProject.reset();
    this.createFormOpen.set(true);
  }

  closeCreateForm(): void {
    if (this.createProject.isPending()) return;
    this.createProject.reset();
    this.createFormOpen.set(false);
  }

  submitProject(request: CreateProjectRequest): void {
    if (this.canManage() && !this.createProject.isPending()) this.createProject.mutate(request);
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.projects.error());
  }

  createErrorTranslationKey(): string {
    return apiErrorTranslationKey(this.createProject.error());
  }
}
