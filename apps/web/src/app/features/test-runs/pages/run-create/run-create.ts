import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CreateTestRunStatus, TestCaseTemplate } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectInfiniteQuery, injectMutation } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import {
  Breadcrumbs,
  Button,
  Callout,
  FormControlStyle,
  FormField,
  LoadingSkeleton,
  PageState,
  StatusBadge,
} from '../../../../shared/ui/public-api';
import { TestCasesApi } from '../../../test-cases/public-api';
import { TestRunsApi } from '../../data-access/test-runs-api';

const TEMPLATE_TRANSLATION_KEYS: Record<TestCaseTemplate, string> = {
  steps: 'workspace.cases.templates.steps',
  text: 'workspace.cases.templates.text',
  exploratory: 'workspace.cases.templates.exploratory',
  bdd: 'workspace.cases.templates.bdd',
};

@Component({
  selector: 'app-run-create',
  imports: [
    Breadcrumbs,
    Button,
    Callout,
    FormControlStyle,
    FormField,
    LoadingSkeleton,
    PageState,
    ReactiveFormsModule,
    RouterLink,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './run-create.html',
  styleUrl: './run-create.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunCreate {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly testCasesApi = inject(TestCasesApi);
  private readonly testRunsApi = inject(TestRunsApi);
  private readonly workspaceSession = inject(WorkspaceSession);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly search = signal('');
  readonly submissionAttempted = signal(false);
  readonly canCreate = computed(() => this.workspaceSession.role() !== 'read_only');
  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    build: ['', Validators.maxLength(200)],
  });
  readonly searchControl = new FormControl('', { nonNullable: true });

  readonly cases = injectInfiniteQuery(() => ({
    queryKey: ['run-case-selection', this.workspaceSlug, this.projectSlug, this.search()],
    queryFn: ({ pageParam }) =>
      this.testCasesApi.listTestCases(
        this.workspaceSlug,
        this.projectSlug,
        pageParam ?? undefined,
        this.search() || undefined,
        undefined,
        'active',
        100,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));

  readonly items = computed(() => this.cases.data()?.pages.flatMap(({ items }) => items) ?? []);
  readonly project = computed(() => this.cases.data()?.pages[0]?.project ?? null);
  readonly allVisibleSelected = computed(
    () => this.items().length > 0 && this.items().every(({ id }) => this.selectedIds().has(id)),
  );

  readonly createRun = injectMutation(() => ({
    mutationFn: (status: CreateTestRunStatus) => {
      const value = this.form.getRawValue();
      return this.testRunsApi.createTestRun(this.workspaceSlug, this.projectSlug, {
        name: value.name.trim(),
        build: value.build.trim() || undefined,
        status,
        caseIds: [...this.selectedIds()],
      });
    },
    onSuccess: ({ run }) => {
      this.form.markAsPristine();
      this.selectedIds.set(new Set());
      return this.router.navigate(['/', this.workspaceSlug, this.projectSlug, 'runs', run.id]);
    },
  }));

  applySearch(): void {
    this.search.set(this.searchControl.value.trim());
  }

  clearSearch(): void {
    this.searchControl.setValue('');
    this.search.set('');
  }

  toggleCase(caseId: string, selected: boolean): void {
    const next = new Set(this.selectedIds());
    if (selected) next.add(caseId);
    else next.delete(caseId);
    this.selectedIds.set(next);
  }

  toggleVisible(selected: boolean): void {
    const next = new Set(this.selectedIds());
    for (const testCase of this.items()) {
      if (selected) next.add(testCase.id);
      else next.delete(testCase.id);
    }
    this.selectedIds.set(next);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  templateTranslationKey(template: TestCaseTemplate): string {
    return TEMPLATE_TRANSLATION_KEYS[template];
  }

  submit(status: CreateTestRunStatus = 'active'): void {
    this.submissionAttempted.set(true);
    if (!this.canCreate() || this.form.invalid || this.selectedIds().size === 0) {
      this.form.markAllAsTouched();
      return;
    }
    this.createRun.mutate(status);
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.createRun.error() ?? this.cases.error());
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty || this.selectedIds().size > 0;
  }

  @HostListener('window:beforeunload', ['$event'])
  preventAccidentalUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }
}
