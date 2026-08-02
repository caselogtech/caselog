import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { TestCaseTemplate } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectInfiniteQuery, injectQuery } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../shared/api/api-error';
import { WorkspaceApi } from '../workspace-api';

const TEMPLATE_TRANSLATION_KEYS: Record<TestCaseTemplate, string> = {
  steps: 'workspace.cases.templates.steps',
  text: 'workspace.cases.templates.text',
  exploratory: 'workspace.cases.templates.exploratory',
  bdd: 'workspace.cases.templates.bdd',
};

@Component({
  selector: 'app-case-list',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
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
  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly search = signal(this.route.snapshot.queryParamMap.get('search')?.trim() ?? '');
  readonly sectionId = signal(this.route.snapshot.queryParamMap.get('section') ?? '');

  readonly searchForm = this.formBuilder.group({
    search: [this.search()],
  });

  readonly structure = injectQuery(() => ({
    queryKey: ['project-structure', this.workspaceSlug, this.projectSlug],
    queryFn: () => this.workspaceApi.projectStructure(this.workspaceSlug, this.projectSlug),
  }));

  readonly cases = injectInfiniteQuery(() => ({
    queryKey: ['test-cases', this.workspaceSlug, this.projectSlug, this.search(), this.sectionId()],
    queryFn: ({ pageParam }) =>
      this.workspaceApi.listTestCases(
        this.workspaceSlug,
        this.projectSlug,
        pageParam ?? undefined,
        this.search() || undefined,
        this.sectionId() || undefined,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));

  readonly items = computed(() => this.cases.data()?.pages.flatMap(({ items }) => items) ?? []);
  readonly project = computed(() => this.cases.data()?.pages[0]?.project ?? null);
  readonly canCreate = computed(() => this.workspaceSession.role() !== 'read_only');

  async applySearch(): Promise<void> {
    const search = this.searchForm.controls.search.value.trim();
    this.search.set(search);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: search || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  async clearSearch(): Promise<void> {
    this.searchForm.controls.search.setValue('');
    await this.applySearch();
  }

  async selectSection(sectionId: string): Promise<void> {
    this.sectionId.set(sectionId);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section: sectionId || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  templateTranslationKey(template: TestCaseTemplate): string {
    return TEMPLATE_TRANSLATION_KEYS[template];
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.cases.error());
  }
}
