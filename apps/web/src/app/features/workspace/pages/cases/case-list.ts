import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { TestCaseTemplate } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import {
  Button,
  Callout,
  FormControlStyle,
  LoadingSkeleton,
  PageState,
} from '../../../../shared/ui/public-api';
import { CaseRepositorySidebar } from '../../components/case-repository-sidebar/case-repository-sidebar';
import { WorkspaceApi } from '../../data-access/workspace-api';

const TEMPLATE_TRANSLATION_KEYS: Record<TestCaseTemplate, string> = {
  steps: 'workspace.cases.templates.steps',
  text: 'workspace.cases.templates.text',
  exploratory: 'workspace.cases.templates.exploratory',
  bdd: 'workspace.cases.templates.bdd',
};

@Component({
  selector: 'app-case-list',
  imports: [
    Button,
    Callout,
    CaseRepositorySidebar,
    DatePipe,
    FormControlStyle,
    LoadingSkeleton,
    PageState,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './case-list.html',
  styleUrl: './case-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly search = signal(this.route.snapshot.queryParamMap.get('search')?.trim() ?? '');
  readonly sectionId = signal(this.route.snapshot.queryParamMap.get('section') ?? '');
  readonly state = signal<'active' | 'archived'>(
    this.route.snapshot.queryParamMap.get('state') === 'archived' ? 'archived' : 'active',
  );
  readonly searchForm = this.formBuilder.group({ search: [this.search()] });

  readonly cases = injectInfiniteQuery(() => ({
    queryKey: [
      'test-cases',
      this.workspaceSlug,
      this.projectSlug,
      this.search(),
      this.sectionId(),
      this.state(),
    ],
    queryFn: ({ pageParam }) =>
      this.workspaceApi.listTestCases(
        this.workspaceSlug,
        this.projectSlug,
        pageParam ?? undefined,
        this.search() || undefined,
        this.sectionId() || undefined,
        this.state(),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));

  readonly items = computed(() => this.cases.data()?.pages.flatMap(({ items }) => items) ?? []);
  readonly project = computed(() => this.cases.data()?.pages[0]?.project ?? null);
  readonly selectedSectionName = computed(
    () => this.items().find(({ section }) => section.id === this.sectionId())?.section.name ?? '',
  );
  readonly canCreate = computed(() => this.workspaceSession.role() !== 'read_only');
  readonly hasFilters = computed(() => Boolean(this.search() || this.sectionId()));

  readonly duplicateCase = injectMutation(() => ({
    mutationFn: (caseId: string) =>
      this.workspaceApi.duplicateTestCase(this.workspaceSlug, this.projectSlug, caseId),
    onSuccess: () => this.invalidateCases(),
  }));
  readonly archiveCase = injectMutation(() => ({
    mutationFn: (caseId: string) =>
      this.workspaceApi.archiveTestCase(this.workspaceSlug, this.projectSlug, caseId),
    onSuccess: () => this.invalidateCases(),
  }));
  readonly restoreCase = injectMutation(() => ({
    mutationFn: (caseId: string) =>
      this.workspaceApi.restoreArchivedTestCase(this.workspaceSlug, this.projectSlug, caseId),
    onSuccess: () => this.invalidateCases(),
  }));

  async applySearch(): Promise<void> {
    const search = this.searchForm.controls.search.value.trim();
    this.search.set(search);
    await this.updateQueryParams({ search: search || null });
  }

  async clearSearch(): Promise<void> {
    this.searchForm.controls.search.setValue('');
    await this.applySearch();
  }

  async clearFilters(): Promise<void> {
    this.searchForm.controls.search.setValue('');
    this.search.set('');
    this.sectionId.set('');
    await this.updateQueryParams({ search: null, section: null });
  }

  async selectSection(sectionId: string): Promise<void> {
    this.sectionId.set(sectionId);
    await this.updateQueryParams({ section: sectionId || null });
  }

  async selectState(state: 'active' | 'archived'): Promise<void> {
    this.state.set(state);
    await this.updateQueryParams({ state: state === 'archived' ? state : null });
  }

  templateTranslationKey(template: TestCaseTemplate): string {
    return TEMPLATE_TRANSLATION_KEYS[template];
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.duplicateCase.error() ??
        this.archiveCase.error() ??
        this.restoreCase.error() ??
        this.cases.error(),
    );
  }

  private updateQueryParams(queryParams: Record<string, string | null>): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private invalidateCases(): Promise<void> {
    return this.queryClient.invalidateQueries({
      queryKey: ['test-cases', this.workspaceSlug, this.projectSlug],
    });
  }
}
