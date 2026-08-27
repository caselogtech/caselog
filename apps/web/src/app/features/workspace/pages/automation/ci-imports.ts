import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { JUnitUploadResponse, ResultIngestion, ResultIngestionStatus } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
} from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { TestRunsApi } from '../../../test-runs/public-api';
import { WorkspaceApi } from '../../data-access/workspace-api';

const MAX_BROWSER_UPLOAD_BYTES = 250 * 1024 * 1024;

@Component({
  selector: 'app-ci-imports',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, RouterLink, TranslocoPipe],
  templateUrl: './ci-imports.html',
  styleUrl: './ci-imports.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CiImports {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly testRunsApi = inject(TestRunsApi);
  private readonly workspaceApi = inject(WorkspaceApi);
  private readonly workspaceSession = inject(WorkspaceSession);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly status = signal<ResultIngestionStatus | undefined>(this.readStatus());
  readonly selectedRunId = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal<'type' | 'size' | null>(null);
  readonly dragActive = signal(false);
  readonly lastUpload = signal<JUnitUploadResponse | null>(null);
  readonly pipelineControl = new FormControl('', { nonNullable: true });
  readonly branchControl = new FormControl('', { nonNullable: true });
  readonly canUpload = computed(() => this.workspaceSession.role() !== 'read_only');

  readonly imports = injectInfiniteQuery(() => ({
    queryKey: ['result-ingestions', this.workspaceSlug, this.projectSlug, this.status()],
    queryFn: ({ pageParam }) =>
      this.workspaceApi.listResultIngestions(
        this.workspaceSlug,
        this.projectSlug,
        pageParam ?? undefined,
        this.status(),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  }));

  readonly activeRuns = injectQuery(() => ({
    queryKey: ['result-ingestion-active-runs', this.workspaceSlug, this.projectSlug],
    queryFn: () =>
      this.testRunsApi.listTestRuns(this.workspaceSlug, this.projectSlug, undefined, 'active', 100),
  }));

  readonly items = computed(() => this.imports.data()?.pages.flatMap(({ items }) => items) ?? []);
  readonly summary = computed(() => this.imports.data()?.pages[0]?.summary ?? null);
  readonly project = computed(
    () => this.imports.data()?.pages[0]?.project ?? this.activeRuns.data()?.project ?? null,
  );
  readonly effectiveRunId = computed(
    () => this.selectedRunId() || this.activeRuns.data()?.items[0]?.id || '',
  );

  readonly upload = injectMutation(() => ({
    mutationFn: ({ runId, file }: { runId: string; file: File }) =>
      this.workspaceApi.uploadJUnitResults(this.workspaceSlug, this.projectSlug, runId, file, {
        pipeline: this.pipelineControl.value.trim() || undefined,
        branch: this.branchControl.value.trim() || undefined,
      }),
    onSuccess: async (response) => {
      this.lastUpload.set(response);
      this.selectedFile.set(null);
      await this.imports.refetch();
    },
  }));

  async selectStatus(status?: ResultIngestionStatus): Promise<void> {
    this.status.set(status);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: status ?? null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  selectRun(value: string): void {
    this.selectedRunId.set(value);
  }

  selectFile(file: File | undefined): void {
    this.lastUpload.set(null);
    this.upload.reset();
    if (!file) {
      this.selectedFile.set(null);
      return;
    }
    if (file.size > MAX_BROWSER_UPLOAD_BYTES) {
      this.selectedFile.set(null);
      this.fileError.set('size');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.xml')) {
      this.selectedFile.set(null);
      this.fileError.set('type');
      return;
    }
    this.fileError.set(null);
    this.selectedFile.set(file);
  }

  handleFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectFile(input.files?.[0]);
    input.value = '';
  }

  handleDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    this.selectFile(event.dataTransfer?.files[0]);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
    if (this.canUpload()) this.dragActive.set(true);
  }

  uploadReport(): void {
    const runId = this.effectiveRunId();
    const file = this.selectedFile();
    if (!this.canUpload() || !runId || !file || this.upload.isPending()) return;
    this.upload.mutate({ runId, file });
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.imports.error());
  }

  uploadErrorTranslationKey(): string {
    return apiErrorTranslationKey(this.upload.error());
  }

  activeRunsErrorTranslationKey(): string {
    return apiErrorTranslationKey(this.activeRuns.error());
  }

  matchedPercent(item: ResultIngestion): number {
    return item.total === 0 ? 0 : Math.round((item.recorded / item.total) * 100);
  }

  private readStatus(): ResultIngestionStatus | undefined {
    const status = this.route.snapshot.queryParamMap.get('status');
    return status === 'completed' || status === 'failed' ? status : undefined;
  }
}
