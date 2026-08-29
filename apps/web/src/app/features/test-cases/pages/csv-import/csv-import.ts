import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  type CsvImportPreviewResponse,
  type CsvImportRequest,
  type CsvImportResponse,
  csvImportRequestSchema,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import { Breadcrumbs, Button, LoadingSkeleton, PageState } from '../../../../shared/ui/public-api';
import { CsvImportFile } from '../../components/csv-import-file/csv-import-file';
import { CsvImportMapping } from '../../components/csv-import-mapping/csv-import-mapping';
import { createCsvImportMappingForm } from '../../components/csv-import-mapping/csv-import-mapping-form';
import { CsvImportPreview } from '../../components/csv-import-preview/csv-import-preview';
import { CsvImportProgress } from '../../components/csv-import-progress/csv-import-progress';
import { CsvImportResult } from '../../components/csv-import-result/csv-import-result';
import { TestCaseImportsApi } from '../../data-access/test-case-imports-api';
import { TestCaseStructureApi } from '../../data-access/test-case-structure-api';
import { CSV_DELIMITERS, type CsvDelimiter, parseCsvHeader } from '../../domain/csv-header';
import {
  type CsvFileError,
  type CsvSourceResult,
  readCsvSource,
  suggestedCsvMapping,
} from '../../domain/csv-import-source';

const FILE_ERROR_TRANSLATIONS: Record<CsvFileError, string> = {
  type: 'workspace.cases.csvImport.fileErrors.type',
  size: 'workspace.cases.csvImport.fileErrors.size',
  empty: 'workspace.cases.csvImport.fileErrors.empty',
  read: 'workspace.cases.csvImport.fileErrors.read',
  header: 'workspace.cases.csvImport.fileErrors.header',
};

@Component({
  selector: 'app-csv-import',
  imports: [
    Breadcrumbs,
    Button,
    CsvImportFile,
    CsvImportMapping,
    CsvImportPreview,
    CsvImportProgress,
    CsvImportResult,
    LoadingSkeleton,
    PageState,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './csv-import.html',
  styleUrl: './csv-import.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsvImport {
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly importsApi = inject(TestCaseImportsApi);
  private readonly structureApi = inject(TestCaseStructureApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryClient = inject(QueryClient);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly canImport = computed(() =>
    hasWorkspacePermission(this.workspaceSession.role(), 'write'),
  );
  readonly selectedFile = signal<File | null>(null);
  readonly csv = signal('');
  readonly delimiter = signal<CsvDelimiter>(',');
  readonly columns = signal<string[]>([]);
  readonly fileError = signal<CsvFileError | null>(null);
  readonly readingFile = signal(false);
  readonly previewData = signal<CsvImportPreviewResponse | null>(null);
  readonly previewedRequest = signal<CsvImportRequest | null>(null);
  readonly idempotencyKey = signal<string | null>(null);
  readonly importResult = signal<CsvImportResponse | null>(null);

  readonly mappingForm = createCsvImportMappingForm(this.formBuilder);
  readonly currentStep = computed<1 | 2 | 3>(() => {
    if (this.previewData() || this.importResult()) return 3;
    if (this.selectedFile()) return 2;
    return 1;
  });

  readonly structure = injectQuery(() => ({
    queryKey: ['project-structure', this.workspaceSlug, this.projectSlug],
    queryFn: () => this.structureApi.projectStructure(this.workspaceSlug, this.projectSlug),
  }));

  readonly sections = computed(
    () => this.structure.data()?.suites.flatMap((suite) => suite.sections) ?? [],
  );

  readonly preview = injectMutation(() => ({
    mutationFn: (request: CsvImportRequest) =>
      this.importsApi.previewCsvImport(this.workspaceSlug, this.projectSlug, request),
    onSuccess: (response, request) => {
      this.previewData.set(response);
      this.previewedRequest.set(request);
      this.idempotencyKey.set(crypto.randomUUID());
      this.importResult.set(null);
    },
  }));

  readonly commit = injectMutation(() => ({
    mutationFn: ({
      request,
      idempotencyKey,
    }: {
      request: CsvImportRequest;
      idempotencyKey: string;
    }) =>
      this.importsApi.commitCsvImport(
        this.workspaceSlug,
        this.projectSlug,
        request,
        idempotencyKey,
      ),
    onSuccess: async (response) => {
      this.importResult.set(response);
      await this.queryClient.invalidateQueries({
        queryKey: ['test-cases', this.workspaceSlug, this.projectSlug],
      });
    },
  }));

  constructor() {
    effect(() => {
      const firstSection = this.sections()[0];
      if (firstSection && !this.mappingForm.controls.defaultSectionId.value) {
        this.mappingForm.controls.defaultSectionId.setValue(firstSection.id);
      }
    });
    this.mappingForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.clearPreview());
  }

  async selectFile(file: File | undefined): Promise<void> {
    this.resetFileState();
    if (!file) return;
    this.readingFile.set(true);
    let source: CsvSourceResult;
    try {
      source = await readCsvSource(file);
    } finally {
      this.readingFile.set(false);
    }
    if (!source.success) {
      this.fileError.set(source.error);
      return;
    }
    this.selectedFile.set(file);
    this.csv.set(source.csv);
    this.delimiter.set(source.delimiter);
    this.columns.set(source.columns);
    this.applySuggestedMapping(source.columns);
  }

  changeDelimiter(value: string): void {
    if (!CSV_DELIMITERS.includes(value as CsvDelimiter) || !this.csv()) return;
    const delimiter = value as CsvDelimiter;
    try {
      const columns = parseCsvHeader(this.csv(), delimiter);
      this.fileError.set(null);
      this.delimiter.set(delimiter);
      this.columns.set(columns);
      this.applySuggestedMapping(columns);
    } catch {
      this.columns.set([]);
      this.fileError.set('header');
    }
  }

  previewImport(): void {
    this.mappingForm.markAllAsTouched();
    const request = this.request();
    if (!this.canImport() || this.mappingForm.invalid || !request.success) return;
    this.preview.mutate(request.data);
  }

  commitImport(): void {
    const request = this.previewedRequest();
    const preview = this.previewData();
    const idempotencyKey = this.idempotencyKey();
    if (
      !this.canImport() ||
      !request ||
      !preview ||
      !idempotencyKey ||
      preview.summary.invalid > 0
    ) {
      return;
    }
    this.commit.mutate({ request, idempotencyKey });
  }

  editMapping(): void {
    this.clearPreview();
  }

  reset(): void {
    this.resetFileState();
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(
      this.commit.error() ?? this.preview.error() ?? this.structure.error(),
    );
  }

  fileErrorTranslationKey(): string {
    return FILE_ERROR_TRANSLATIONS[this.fileError() ?? 'read'];
  }

  private request() {
    const value = this.mappingForm.getRawValue();
    return csvImportRequestSchema.safeParse({
      csv: this.csv(),
      delimiter: this.delimiter(),
      mapping: {
        title: value.title,
        content: value.content,
        ...(value.sectionId ? { sectionId: value.sectionId } : {}),
        ...(value.template ? { template: value.template } : {}),
        ...(value.automationId ? { automationId: value.automationId } : {}),
        ...(value.preconditions ? { preconditions: value.preconditions } : {}),
        ...(value.expectedResult ? { expectedResult: value.expectedResult } : {}),
      },
      defaults: {
        sectionId: value.defaultSectionId,
        template: value.defaultTemplate,
      },
    });
  }

  private applySuggestedMapping(columns: string[]): void {
    this.mappingForm.patchValue(suggestedCsvMapping(columns));
  }

  private clearPreview(): void {
    this.previewData.set(null);
    this.previewedRequest.set(null);
    this.idempotencyKey.set(null);
    this.importResult.set(null);
    this.preview.reset();
    this.commit.reset();
  }

  private resetFileState(): void {
    this.selectedFile.set(null);
    this.csv.set('');
    this.columns.set([]);
    this.fileError.set(null);
    this.clearPreview();
    this.mappingForm.reset({
      title: '',
      content: '',
      sectionId: '',
      template: '',
      automationId: '',
      preconditions: '',
      expectedResult: '',
      defaultSectionId: this.sections()[0]?.id ?? '',
      defaultTemplate: 'steps',
    });
  }
}
