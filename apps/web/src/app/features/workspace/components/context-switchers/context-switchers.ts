import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  HostListener,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectInfiniteQuery, injectQuery } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { labelFromSlug } from '../../../../shared/models/slug-label';
import { AuthApi } from '../../../auth/public-api';
import { WorkspaceApi } from '../../data-access/workspace-api';

@Component({
  selector: 'app-context-switchers',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './context-switchers.html',
  styleUrl: './context-switchers.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContextSwitchers {
  private readonly authApi = inject(AuthApi);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly workspaceMenu = viewChild<ElementRef<HTMLDetailsElement>>('workspaceMenu');
  private readonly workspaceSummary = viewChild<ElementRef<HTMLElement>>('workspaceSummary');
  private readonly projectMenu = viewChild<ElementRef<HTMLDetailsElement>>('projectMenu');
  private readonly projectSummary = viewChild<ElementRef<HTMLElement>>('projectSummary');

  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input('');

  readonly workspaces = injectQuery(() => ({
    queryKey: ['workspaces', 'active'],
    queryFn: () => this.authApi.listWorkspaces('active'),
  }));
  readonly projects = injectInfiniteQuery(() => ({
    queryKey: ['projects', this.workspaceSlug()],
    queryFn: ({ pageParam }) =>
      this.workspaceApi.listProjects(this.workspaceSlug(), pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(this.workspaceSlug()),
  }));

  readonly projectOptions = computed(
    () => this.projects.data()?.pages.flatMap(({ items }) => items) ?? [],
  );
  readonly workspaceName = computed(() => {
    const slug = this.workspaceSlug();
    return (
      this.workspaces.data()?.workspaces.find((workspace) => workspace.slug === slug)?.name ??
      (this.workspaceSession.organization()?.slug === slug
        ? this.workspaceSession.organization()?.name
        : undefined) ??
      labelFromSlug(slug)
    );
  });
  readonly projectName = computed(() => {
    const slug = this.projectSlug();
    return (
      this.projectOptions().find((project) => project.slug === slug)?.name ?? labelFromSlug(slug)
    );
  });

  closeMenus(): void {
    const workspaceMenu = this.workspaceMenu()?.nativeElement;
    const projectMenu = this.projectMenu()?.nativeElement;
    if (workspaceMenu) workspaceMenu.open = false;
    if (projectMenu) projectMenu.open = false;
  }

  @HostListener('document:click', ['$event'])
  closeMenusFromOutsideClick(event: MouseEvent): void {
    if (!(event.target instanceof Node)) return;
    const workspaceMenu = this.workspaceMenu()?.nativeElement;
    const projectMenu = this.projectMenu()?.nativeElement;
    if (workspaceMenu?.open && !workspaceMenu.contains(event.target)) workspaceMenu.open = false;
    if (projectMenu?.open && !projectMenu.contains(event.target)) projectMenu.open = false;
  }

  @HostListener('document:keydown.escape')
  closeMenuFromKeyboard(): void {
    const projectMenu = this.projectMenu()?.nativeElement;
    if (projectMenu?.open) {
      projectMenu.open = false;
      this.projectSummary()?.nativeElement.focus();
      return;
    }

    const workspaceMenu = this.workspaceMenu()?.nativeElement;
    if (workspaceMenu?.open) {
      workspaceMenu.open = false;
      this.workspaceSummary()?.nativeElement.focus();
    }
  }
}
