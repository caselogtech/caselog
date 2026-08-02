import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { TestCaseTemplate } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
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
  private readonly queryClient = inject(QueryClient);
  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly search = signal(this.route.snapshot.queryParamMap.get('search')?.trim() ?? '');
  readonly sectionId = signal(this.route.snapshot.queryParamMap.get('section') ?? '');
  readonly state = signal<'active' | 'archived'>(
    this.route.snapshot.queryParamMap.get('state') === 'archived' ? 'archived' : 'active',
  );
  readonly sectionEditor = signal<{ suiteId: string; parentId?: string } | null>(null);
  readonly renameTarget = signal<{ type: 'suite' | 'section'; id: string } | null>(null);

  readonly searchForm = this.formBuilder.group({
    search: [this.search()],
  });
  readonly suiteForm = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });
  readonly sectionForm = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });
  readonly renameForm = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });

  readonly structure = injectQuery(() => ({
    queryKey: ['project-structure', this.workspaceSlug, this.projectSlug],
    queryFn: () => this.workspaceApi.projectStructure(this.workspaceSlug, this.projectSlug),
  }));

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
  readonly canCreate = computed(() => this.workspaceSession.role() !== 'read_only');

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

  readonly createSuite = injectMutation(() => ({
    mutationFn: (name: string) =>
      this.workspaceApi.createSuite(this.workspaceSlug, this.projectSlug, name),
    onSuccess: async () => {
      this.suiteForm.reset();
      await this.invalidateStructure();
    },
  }));

  readonly createSection = injectMutation(() => ({
    mutationFn: (input: { suiteId: string; parentId?: string; name: string }) =>
      this.workspaceApi.createSection(
        this.workspaceSlug,
        this.projectSlug,
        input.suiteId,
        input.name,
        input.parentId,
      ),
    onSuccess: async () => {
      this.sectionForm.reset();
      this.sectionEditor.set(null);
      await this.invalidateStructure();
    },
  }));

  readonly renameStructureItem = injectMutation(() => ({
    mutationFn: (input: { type: 'suite' | 'section'; id: string; name: string }) =>
      input.type === 'suite'
        ? this.workspaceApi.updateSuite(this.workspaceSlug, this.projectSlug, input.id, input.name)
        : this.workspaceApi.updateSection(
            this.workspaceSlug,
            this.projectSlug,
            input.id,
            input.name,
          ),
    onSuccess: async () => {
      this.renameTarget.set(null);
      await this.invalidateStructure();
    },
  }));

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

  async selectState(state: 'active' | 'archived'): Promise<void> {
    this.state.set(state);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { state: state === 'archived' ? state : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  submitSuite(): void {
    if (this.suiteForm.invalid) {
      this.suiteForm.markAllAsTouched();
      return;
    }
    this.createSuite.mutate(this.suiteForm.controls.name.value.trim());
  }

  beginSection(suiteId: string, parentId?: string): void {
    this.sectionForm.reset();
    this.sectionEditor.set({ suiteId, parentId });
  }

  submitSection(): void {
    const target = this.sectionEditor();
    if (!target || this.sectionForm.invalid) {
      this.sectionForm.markAllAsTouched();
      return;
    }
    this.createSection.mutate({
      ...target,
      name: this.sectionForm.controls.name.value.trim(),
    });
  }

  beginRename(type: 'suite' | 'section', id: string, name: string): void {
    this.renameForm.controls.name.setValue(name);
    this.renameTarget.set({ type, id });
  }

  submitRename(): void {
    const target = this.renameTarget();
    if (!target || this.renameForm.invalid) {
      this.renameForm.markAllAsTouched();
      return;
    }
    this.renameStructureItem.mutate({
      ...target,
      name: this.renameForm.controls.name.value.trim(),
    });
  }

  templateTranslationKey(template: TestCaseTemplate): string {
    return TEMPLATE_TRANSLATION_KEYS[template];
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.duplicateCase.error() ??
        this.archiveCase.error() ??
        this.restoreCase.error() ??
        this.createSuite.error() ??
        this.createSection.error() ??
        this.renameStructureItem.error() ??
        this.cases.error(),
    );
  }

  private invalidateCases(): Promise<void> {
    return this.queryClient.invalidateQueries({
      queryKey: ['test-cases', this.workspaceSlug, this.projectSlug],
    });
  }

  private invalidateStructure(): Promise<void> {
    return this.queryClient.invalidateQueries({
      queryKey: ['project-structure', this.workspaceSlug, this.projectSlug],
    });
  }
}
