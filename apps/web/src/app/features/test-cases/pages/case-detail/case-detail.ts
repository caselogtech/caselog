import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { type UpdateTestCaseRequest, updateTestCaseRequestSchema } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import {
  Breadcrumbs,
  Button,
  Callout,
  LoadingSkeleton,
  PageState,
  StatusBadge,
} from '../../../../shared/ui/public-api';
import { CaseAttachmentsPanel } from '../../components/case-attachments-panel/case-attachments-panel';
import { CaseContentView } from '../../components/case-content-view/case-content-view';
import { CaseEditor } from '../../components/case-editor/case-editor';
import {
  createCaseEditorForm,
  createCaseStepForm,
} from '../../components/case-editor/case-editor-form';
import { CaseExecutionHistory } from '../../components/case-execution-history/case-execution-history';
import { CaseVersionHistory } from '../../components/case-version-history/case-version-history';
import { TestCaseAttachmentsApi } from '../../data-access/test-case-attachments-api';
import { TestCaseStructureApi } from '../../data-access/test-case-structure-api';
import { TestCasesApi } from '../../data-access/test-cases-api';
import { testCaseDraftContent } from '../../domain/test-case-draft';

@Component({
  selector: 'app-case-detail',
  imports: [
    Breadcrumbs,
    Button,
    Callout,
    CaseAttachmentsPanel,
    CaseContentView,
    CaseEditor,
    CaseExecutionHistory,
    CaseVersionHistory,
    LoadingSkeleton,
    PageState,
    ReactiveFormsModule,
    RouterLink,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './case-detail.html',
  styleUrl: './case-detail.css',
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
  readonly canEdit = computed(() => hasWorkspacePermission(this.workspaceSession.role(), 'write'));

  readonly form = createCaseEditorForm(this.formBuilder);

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
      this.form.controls.steps.push(
        createCaseStepForm(this.formBuilder, step.action, step.expected ?? ''),
      );
    }
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.updateCase.reset();
    this.editing.set(true);
  }

  cancelEditing(): void {
    this.editing.set(false);
    this.updateCase.reset();
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

  uploadFile(file: File): void {
    if (this.canEdit()) {
      this.uploadAttachment.mutate(file);
    }
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
      content: testCaseDraftContent(value),
    };
    return updateTestCaseRequestSchema.safeParse(common);
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
