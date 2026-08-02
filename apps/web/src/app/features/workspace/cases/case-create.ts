import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  createTestCaseRequestSchema,
  type CreateTestCaseRequest,
  type TestCaseTemplate,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../shared/api/api-error';
import { WorkspaceApi } from '../workspace-api';

@Component({
  selector: 'app-case-create',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './case-create.html',
  styleUrl: './case-create.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseCreate {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly canCreate = computed(() => this.workspaceSession.role() !== 'read_only');

  readonly form = this.formBuilder.group({
    title: ['', [Validators.required, Validators.maxLength(500)]],
    sectionId: ['', Validators.required],
    template: this.formBuilder.control<TestCaseTemplate>('steps'),
    automationId: ['', Validators.maxLength(500)],
    preconditions: ['', Validators.maxLength(50_000)],
    expectedResult: ['', Validators.maxLength(50_000)],
    text: ['', Validators.maxLength(50_000)],
    charter: ['', Validators.maxLength(50_000)],
    gherkin: ['', Validators.maxLength(50_000)],
    steps: this.formBuilder.array([this.createStep()]),
  });

  readonly structure = injectQuery(() => ({
    queryKey: ['project-structure', this.workspaceSlug, this.projectSlug],
    queryFn: () => this.workspaceApi.projectStructure(this.workspaceSlug, this.projectSlug),
  }));

  readonly sections = computed(
    () => this.structure.data()?.suites.flatMap((suite) => suite.sections) ?? [],
  );

  readonly createCase = injectMutation(() => ({
    mutationFn: (request: CreateTestCaseRequest) =>
      this.workspaceApi.createTestCase(this.workspaceSlug, this.projectSlug, request),
    onSuccess: async ({ testCase }) => {
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

    this.form.controls.template.valueChanges.pipe(takeUntilDestroyed()).subscribe((template) => {
      this.updateTemplateValidators(template);
    });
    this.updateTemplateValidators(this.form.controls.template.value);
  }

  addStep(): void {
    const step = this.createStep();
    if (this.form.controls.template.value === 'steps') {
      step.controls.action.addValidators(Validators.required);
    }
    this.form.controls.steps.push(step);
  }

  removeStep(index: number): void {
    if (this.form.controls.steps.length > 1) {
      this.form.controls.steps.removeAt(index);
    }
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

  private createStep() {
    return this.formBuilder.group({
      action: ['', [Validators.required, Validators.maxLength(10_000)]],
      expected: ['', Validators.maxLength(10_000)],
    });
  }

  private updateTemplateValidators(template: TestCaseTemplate): void {
    const contentControls: AbstractControl[] = [
      this.form.controls.text,
      this.form.controls.charter,
      this.form.controls.gherkin,
      ...this.form.controls.steps.controls.map((step) => step.controls.action),
    ];
    for (const control of contentControls) {
      control.removeValidators(Validators.required);
    }

    if (template === 'steps') {
      for (const step of this.form.controls.steps.controls) {
        step.controls.action.addValidators(Validators.required);
      }
    } else if (template === 'text') {
      this.form.controls.text.addValidators(Validators.required);
    } else if (template === 'exploratory') {
      this.form.controls.charter.addValidators(Validators.required);
    } else {
      this.form.controls.gherkin.addValidators(Validators.required);
    }

    for (const control of contentControls) {
      control.updateValueAndValidity({ emitEvent: false });
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
    };

    switch (value.template) {
      case 'steps':
        return createTestCaseRequestSchema.safeParse({
          ...common,
          content: {
            steps: value.steps.map((step) => ({
              action: step.action,
              expected: step.expected || undefined,
            })),
          },
        });
      case 'text':
        return createTestCaseRequestSchema.safeParse({
          ...common,
          content: { text: value.text },
        });
      case 'exploratory':
        return createTestCaseRequestSchema.safeParse({
          ...common,
          content: { charter: value.charter },
        });
      case 'bdd':
        return createTestCaseRequestSchema.safeParse({
          ...common,
          content: { gherkin: value.gherkin },
        });
    }
  }
}
