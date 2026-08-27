import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  csvImportRequestSchema,
  type CsvImportPreviewResponse,
  type CsvImportRequest,
  type CsvImportResponse,
  type TestCaseTemplate,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { TestCaseImportsApi } from '../../data-access/test-case-imports-api';
import { TestCaseStructureApi } from '../../data-access/test-case-structure-api';
import {
  CSV_DELIMITERS,
  detectCsvDelimiter,
  parseCsvHeader,
  type CsvDelimiter,
} from '../../domain/csv-header';

const MAX_CSV_BYTES = 5_000_000;
const COLUMN_ALIASES = {
  title: ['title', 'name', 'testcase', 'testcasetitle'],
  content: ['content', 'description', 'steps', 'teststeps'],
  sectionId: ['sectionid', 'sectionuuid'],
  template: ['template', 'type'],
  automationId: ['automationid', 'automation', 'automatedid'],
  preconditions: ['preconditions', 'precondition'],
  expectedResult: ['expectedresult', 'expected', 'outcome'],
} as const;

type FileError = 'type' | 'size' | 'empty' | 'read' | 'header';
const FILE_ERROR_TRANSLATIONS: Record<FileError, string> = {
  type: 'workspace.cases.csvImport.fileErrors.type',
  size: 'workspace.cases.csvImport.fileErrors.size',
  empty: 'workspace.cases.csvImport.fileErrors.empty',
  read: 'workspace.cases.csvImport.fileErrors.read',
  header: 'workspace.cases.csvImport.fileErrors.header',
};

@Component({
  selector: 'app-csv-import',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe],
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
  readonly canImport = computed(() => this.workspaceSession.role() !== 'read_only');
  readonly selectedFile = signal<File | null>(null);
  readonly csv = signal('');
  readonly delimiter = signal<CsvDelimiter>(',');
  readonly columns = signal<string[]>([]);
  readonly fileError = signal<FileError | null>(null);
  readonly readingFile = signal(false);
  readonly dragActive = signal(false);
  readonly previewData = signal<CsvImportPreviewResponse | null>(null);
  readonly previewedRequest = signal<CsvImportRequest | null>(null);
  readonly idempotencyKey = signal<string | null>(null);
  readonly importResult = signal<CsvImportResponse | null>(null);

  readonly mappingForm = this.formBuilder.group({
    title: ['', Validators.required],
    content: ['', Validators.required],
    sectionId: [''],
    template: [''],
    automationId: [''],
    preconditions: [''],
    expectedResult: [''],
    defaultSectionId: ['', Validators.required],
    defaultTemplate: this.formBuilder.control<TestCaseTemplate>('steps'),
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
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.fileError.set('type');
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      this.fileError.set('size');
      return;
    }
    if (file.size === 0) {
      this.fileError.set('empty');
      return;
    }

    this.readingFile.set(true);
    let csv: string;
    try {
      csv = await file.text();
    } catch {
      this.fileError.set('read');
      return;
    } finally {
      this.readingFile.set(false);
    }
    if (!csv.trim()) {
      this.fileError.set('empty');
      return;
    }
    try {
      const delimiter = detectCsvDelimiter(csv);
      const columns = parseCsvHeader(csv, delimiter);
      this.selectedFile.set(file);
      this.csv.set(csv);
      this.delimiter.set(delimiter);
      this.columns.set(columns);
      this.applySuggestedMapping(columns);
    } catch {
      this.fileError.set('header');
    }
  }

  handleFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.selectFile(input.files?.[0]);
    input.value = '';
  }

  handleDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    if (this.canImport()) void this.selectFile(event.dataTransfer?.files[0]);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
    if (this.canImport()) this.dragActive.set(true);
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

  sectionName(sectionId: string): string {
    return this.sections().find((section) => section.id === sectionId)?.name ?? sectionId;
  }

  templateTranslationKey(template: TestCaseTemplate): string {
    return `workspace.cases.templates.${template}`;
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
    const columnByName = new Map(columns.map((column) => [normalizeColumn(column), column]));
    const match = (field: keyof typeof COLUMN_ALIASES): string => {
      for (const alias of COLUMN_ALIASES[field]) {
        const column = columnByName.get(alias);
        if (column) return column;
      }
      return '';
    };
    this.mappingForm.patchValue({
      title: match('title'),
      content: match('content'),
      sectionId: match('sectionId'),
      template: match('template'),
      automationId: match('automationId'),
      preconditions: match('preconditions'),
      expectedResult: match('expectedResult'),
    });
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
    this.dragActive.set(false);
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

function normalizeColumn(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
