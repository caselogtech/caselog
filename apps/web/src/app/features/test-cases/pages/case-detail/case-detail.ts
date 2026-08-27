import { DatePipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  type TestCaseTemplate,
  type UpdateTestCaseRequest,
  updateTestCaseRequestSchema,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { TestCaseAttachmentsApi } from '../../data-access/test-case-attachments-api';
import { TestCaseStructureApi } from '../../data-access/test-case-structure-api';
import { TestCasesApi } from '../../data-access/test-cases-api';

const TEMPLATE_TRANSLATION_KEYS: Record<TestCaseTemplate, string> = {
  steps: 'workspace.cases.templates.steps',
  text: 'workspace.cases.templates.text',
  exploratory: 'workspace.cases.templates.exploratory',
  bdd: 'workspace.cases.templates.bdd',
};

@Component({
  selector: 'app-case-detail',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './case-detail.html',
  styleUrls: ['../case-create/case-create.css', './case-detail.css', './case-attachments.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly attachmentsApi = inject(TestCaseAttachmentsApi);
  private readonly structureApi = inject(TestCaseStructureApi);
  private readonly testCasesApi = inject(TestCasesApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);
  private readonly document = inject(DOCUMENT);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly caseId = this.route.snapshot.paramMap.get('caseId') ?? '';
  readonly editing = signal(false);
  readonly selectedVersionId = signal('');
  readonly canEdit = computed(() => this.workspaceSession.role() !== 'read_only');

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

  readonly detail = injectQuery(() => ({
    queryKey: ['test-case', this.workspaceSlug, this.projectSlug, this.caseId],
    queryFn: () => this.testCasesApi.testCase(this.workspaceSlug, this.projectSlug, this.caseId),
  }));

  readonly executionHistory = injectInfiniteQuery(() => ({
    queryKey: ['case-execution-history', this.workspaceSlug, this.projectSlug, this.caseId],
    queryFn: ({ pageParam }) =>
      this.testCasesApi.testCaseExecutionHistory(
        this.workspaceSlug,
        this.projectSlug,
        this.caseId,
        pageParam ?? undefined,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));

  readonly executionHistoryItems = computed(
    () => this.executionHistory.data()?.pages.flatMap(({ items }) => items) ?? [],
  );

  readonly structure = injectQuery(() => ({
    queryKey: ['project-structure', this.workspaceSlug, this.projectSlug],
    queryFn: () => this.structureApi.projectStructure(this.workspaceSlug, this.projectSlug),
  }));

  readonly current = computed(() => this.detail.data()?.testCase.currentVersion ?? null);

  readonly attachments = injectInfiniteQuery(() => {
    const versionId = this.current()?.id ?? '';
    return {
      queryKey: ['case-attachments', this.workspaceSlug, this.projectSlug, this.caseId, versionId],
      queryFn: ({ pageParam }) =>
        this.attachmentsApi.testCaseAttachments(
          this.workspaceSlug,
          this.projectSlug,
          this.caseId,
          versionId,
          pageParam ?? undefined,
        ),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      enabled: Boolean(versionId),
    };
  });

  readonly attachmentItems = computed(
    () => this.attachments.data()?.pages.flatMap(({ items }) => items) ?? [],
  );

  readonly uploadAttachment = injectMutation(() => ({
    mutationFn: (file: File) => {
      const versionId = this.requireCurrentVersionId();
      return this.attachmentsApi.uploadTestCaseAttachment(
        this.workspaceSlug,
        this.projectSlug,
        this.caseId,
        versionId,
        file,
      );
    },
    onSuccess: () => this.invalidateAttachments(),
  }));

  readonly downloadAttachment = injectMutation(() => ({
    mutationFn: (attachmentId: string) =>
      this.attachmentsApi.testCaseAttachmentDownload(
        this.workspaceSlug,
        this.projectSlug,
        this.caseId,
        this.requireCurrentVersionId(),
        attachmentId,
      ),
    onSuccess: ({ download }) => this.openDownload(download.url),
  }));

  readonly selectedVersion = injectQuery(() => ({
    queryKey: [
      'test-case-version',
      this.workspaceSlug,
      this.projectSlug,
      this.caseId,
      this.selectedVersionId(),
    ],
    queryFn: () =>
      this.testCasesApi.testCaseVersion(
        this.workspaceSlug,
        this.projectSlug,
        this.caseId,
        this.selectedVersionId(),
      ),
    enabled: Boolean(this.selectedVersionId()),
  }));

  readonly updateCase = injectMutation(() => ({
    mutationFn: (request: UpdateTestCaseRequest) =>
      this.testCasesApi.updateTestCase(this.workspaceSlug, this.projectSlug, this.caseId, request),
    onSuccess: async () => {
      this.editing.set(false);
      await Promise.all([
        this.queryClient.invalidateQueries({
          queryKey: ['test-case', this.workspaceSlug, this.projectSlug, this.caseId],
        }),
        this.queryClient.invalidateQueries({
          queryKey: ['test-cases', this.workspaceSlug, this.projectSlug],
        }),
      ]);
    },
  }));

  readonly restoreVersion = injectMutation(() => ({
    mutationFn: (versionId: string) =>
      this.testCasesApi.restoreTestCaseVersion(
        this.workspaceSlug,
        this.projectSlug,
        this.caseId,
        versionId,
        this.current()?.version ?? 0,
      ),
    onSuccess: async () => {
      this.selectedVersionId.set('');
      await Promise.all([
        this.queryClient.invalidateQueries({
          queryKey: ['test-case', this.workspaceSlug, this.projectSlug, this.caseId],
        }),
        this.queryClient.invalidateQueries({
          queryKey: ['test-cases', this.workspaceSlug, this.projectSlug],
        }),
      ]);
    },
  }));

  constructor() {
    this.form.controls.template.valueChanges.pipe(takeUntilDestroyed()).subscribe((template) => {
      this.updateTemplateValidators(template);
    });
    this.updateTemplateValidators('steps');
  }

  startEditing(): void {
    const detail = this.detail.data();
    if (!detail || !this.canEdit()) {
      return;
    }
    const { testCase } = detail;
    const version = testCase.currentVersion;
    this.form.patchValue({
      title: version.title,
      sectionId: testCase.section.id,
      template: version.template,
      automationId: testCase.automationId ?? '',
      preconditions: version.preconditions ?? '',
      expectedResult: version.expectedResult ?? '',
      text: 'text' in version.content ? version.content.text : '',
      charter: 'charter' in version.content ? version.content.charter : '',
      gherkin: 'gherkin' in version.content ? version.content.gherkin : '',
    });
    this.form.controls.steps.clear();
    const steps =
      'steps' in version.content ? version.content.steps : [{ action: '', expected: '' }];
    for (const step of steps) {
      this.form.controls.steps.push(this.createStep(step.action, step.expected ?? ''));
    }
    this.updateTemplateValidators(version.template);
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.updateCase.reset();
    this.editing.set(true);
  }

  cancelEditing(): void {
    this.editing.set(false);
    this.updateCase.reset();
  }

  addStep(): void {
    this.form.controls.steps.push(this.createStep());
  }

  removeStep(index: number): void {
    if (this.form.controls.steps.length > 1) {
      this.form.controls.steps.removeAt(index);
    }
  }

  submit(): void {
    const current = this.current();
    if (!current || !this.canEdit()) {
      return;
    }
    const request = this.request(current.version);
    if (this.form.invalid || !request.success) {
      this.form.markAllAsTouched();
      return;
    }
    this.updateCase.mutate(request.data);
  }

  reload(): void {
    this.cancelEditing();
    void this.detail.refetch();
  }

  viewVersion(versionId: string): void {
    this.restoreVersion.reset();
    this.selectedVersionId.set(versionId);
  }

  closeVersion(): void {
    this.selectedVersionId.set('');
    this.restoreVersion.reset();
  }

  restoreSelectedVersion(): void {
    const version = this.selectedVersion.data();
    if (version && version.id !== this.current()?.id && this.canEdit()) {
      this.restoreVersion.mutate(version.id);
    }
  }

  selectAttachment(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (file && this.canEdit()) {
      this.uploadAttachment.mutate(file);
    }
    input.value = '';
  }

  formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1_024) return `${sizeBytes} B`;
    if (sizeBytes < 1_048_576) return `${(sizeBytes / 1_024).toFixed(1)} KB`;
    return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
  }

  currentSteps(): Array<{ action: string; expected?: string }> {
    const content = this.current()?.content;
    return content && 'steps' in content ? content.steps : [];
  }

  currentText(): string {
    const content = this.current()?.content;
    if (!content) return '';
    if ('text' in content) return content.text;
    if ('charter' in content) return content.charter;
    if ('gherkin' in content) return content.gherkin;
    return '';
  }

  selectedSteps(): Array<{ action: string; expected?: string }> {
    const content = this.selectedVersion.data()?.content;
    return content && 'steps' in content ? content.steps : [];
  }

  selectedText(): string {
    const content = this.selectedVersion.data()?.content;
    if (!content) return '';
    if ('text' in content) return content.text;
    if ('charter' in content) return content.charter;
    if ('gherkin' in content) return content.gherkin;
    return '';
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.updateCase.error() ??
        this.restoreVersion.error() ??
        this.selectedVersion.error() ??
        this.executionHistory.error() ??
        this.detail.error(),
    );
  }

  attachmentErrorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.uploadAttachment.error() ?? this.downloadAttachment.error() ?? this.attachments.error(),
    );
  }

  templateTranslationKey(template: TestCaseTemplate): string {
    return TEMPLATE_TRANSLATION_KEYS[template];
  }

  private createStep(action = '', expected = '') {
    return this.formBuilder.group({
      action: [action, [Validators.required, Validators.maxLength(10_000)]],
      expected: [expected, Validators.maxLength(10_000)],
    });
  }

  private updateTemplateValidators(template: TestCaseTemplate): void {
    const contentControls: AbstractControl[] = [
      this.form.controls.text,
      this.form.controls.charter,
      this.form.controls.gherkin,
      ...this.form.controls.steps.controls.map((step) => step.controls.action),
    ];
    for (const control of contentControls) control.removeValidators(Validators.required);

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
    for (const control of contentControls) control.updateValueAndValidity({ emitEvent: false });
  }

  private request(baseVersion: number) {
    const value = this.form.getRawValue();
    const common = {
      baseVersion,
      title: value.title,
      sectionId: value.sectionId,
      template: value.template,
      automationId: value.automationId,
      preconditions: value.preconditions || undefined,
      expectedResult: value.expectedResult || undefined,
    };
    if (value.template === 'steps') {
      return updateTestCaseRequestSchema.safeParse({
        ...common,
        content: {
          steps: value.steps.map((step) => ({
            action: step.action,
            expected: step.expected || undefined,
          })),
        },
      });
    }
    if (value.template === 'text') {
      return updateTestCaseRequestSchema.safeParse({ ...common, content: { text: value.text } });
    }
    if (value.template === 'exploratory') {
      return updateTestCaseRequestSchema.safeParse({
        ...common,
        content: { charter: value.charter },
      });
    }
    return updateTestCaseRequestSchema.safeParse({
      ...common,
      content: { gherkin: value.gherkin },
    });
  }

  private requireCurrentVersionId(): string {
    const versionId = this.current()?.id;
    if (!versionId) {
      throw new Error('Current case version is unavailable');
    }
    return versionId;
  }

  private invalidateAttachments(): Promise<void> {
    return this.queryClient.invalidateQueries({
      queryKey: ['case-attachments', this.workspaceSlug, this.projectSlug, this.caseId],
    });
  }

  private openDownload(url: string): void {
    const link = this.document.createElement('a');
    link.href = url;
    link.rel = 'noopener';
    this.document.body.append(link);
    link.click();
    link.remove();
  }
}
