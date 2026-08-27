import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { createTestCaseRequestSchema, type CreateTestCaseRequest } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import {
  Button,
  Callout,
  LoadingSkeleton,
  PageState,
  StatusBadge,
} from '../../../../shared/ui/public-api';
import { CaseEditor } from '../../components/case-editor/case-editor';
import { createCaseEditorForm } from '../../components/case-editor/case-editor-form';
import { TestCaseStructureApi } from '../../data-access/test-case-structure-api';
import { TestCasesApi } from '../../data-access/test-cases-api';
import { testCaseDraftContent } from '../../domain/test-case-draft';

@Component({
  selector: 'app-case-create',
  imports: [
    Button,
    Callout,
    CaseEditor,
    LoadingSkeleton,
    PageState,
    ReactiveFormsModule,
    RouterLink,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './case-create.html',
  styleUrl: './case-create.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseCreate {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly structureApi = inject(TestCaseStructureApi);
  private readonly testCasesApi = inject(TestCasesApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly canCreate = computed(() => this.workspaceSession.role() !== 'read_only');

  readonly form = createCaseEditorForm(this.formBuilder);

  readonly structure = injectQuery(() => ({
    queryKey: ['project-structure', this.workspaceSlug, this.projectSlug],
    queryFn: () => this.structureApi.projectStructure(this.workspaceSlug, this.projectSlug),
  }));

  readonly sections = computed(
    () => this.structure.data()?.suites.flatMap((suite) => suite.sections) ?? [],
  );

  readonly createCase = injectMutation(() => ({
    mutationFn: (request: CreateTestCaseRequest) =>
      this.testCasesApi.createTestCase(this.workspaceSlug, this.projectSlug, request),
    onSuccess: async ({ testCase }) => {
      this.form.markAsPristine();
      await this.queryClient.invalidateQueries({
        queryKey: ['test-cases', this.workspaceSlug, this.projectSlug],
      });
      await this.router.navigate(['/', this.workspaceSlug, this.projectSlug, 'cases'], {
        queryParams: { section: testCase.section.id },
      });
    },
  }));

  constructor() {
    effect(() => {
      const firstSection = this.sections()[0];
      if (firstSection && !this.form.controls.sectionId.value) {
        this.form.controls.sectionId.setValue(firstSection.id);
      }
    });
  }

  submit(): void {
    const request = this.request();
    if (!this.canCreate() || this.form.invalid || !request.success) {
      this.form.markAllAsTouched();
      return;
    }
    this.createCase.mutate(request.data);
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.createCase.error() ?? this.structure.error());
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.createCase.isSuccess();
  }

  @HostListener('window:beforeunload', ['$event'])
  protectUnsavedChanges(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  private request() {
    const value = this.form.getRawValue();
    const common = {
      title: value.title,
      sectionId: value.sectionId,
      template: value.template,
      automationId: value.automationId,
      preconditions: value.preconditions || undefined,
      expectedResult: value.expectedResult || undefined,
      content: testCaseDraftContent(value),
    };
    return createTestCaseRequestSchema.safeParse(common);
  }
}
