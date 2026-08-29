import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { JUnitUploadResponse, ResultIngestionStatus } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
} from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { hasWorkspacePermission } from '../../../../shared/models/workspace-role';
import { enumQueryParam } from '../../../../shared/routing/query-param';
import { Breadcrumbs, Button } from '../../../../shared/ui/public-api';
import { TestRunsApi } from '../../../test-runs/public-api';
import { CiImportHistory } from '../../components/ci-import-history/ci-import-history';
import { CiImportSummary } from '../../components/ci-import-summary/ci-import-summary';
import {
  CiUploadPanel,
  type CiUploadRequest,
} from '../../components/ci-upload-panel/ci-upload-panel';
import { CiImportsApi } from '../../data-access/ci-imports-api';

@Component({
  selector: 'app-ci-imports',
  imports: [Breadcrumbs, Button, CiImportHistory, CiImportSummary, CiUploadPanel, TranslocoPipe],
  templateUrl: './ci-imports.html',
  styleUrl: './ci-imports.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CiImports {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly testRunsApi = inject(TestRunsApi);
  private readonly ciImportsApi = inject(CiImportsApi);
  private readonly workspaceSession = inject(WorkspaceSession);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly statuses: ResultIngestionStatus[] = ['completed', 'failed'];
  readonly status = computed(() => enumQueryParam(this.queryParams().get('status'), this.statuses));
  readonly lastUpload = signal<JUnitUploadResponse | null>(null);
  readonly canUpload = computed(() =>
    hasWorkspacePermission(this.workspaceSession.role(), 'write'),
  );

  readonly imports = injectInfiniteQuery(() => ({
    queryKey: ['result-ingestions', this.workspaceSlug, this.projectSlug, this.status()],
    queryFn: ({ pageParam }) =>
      this.ciImportsApi.listResultIngestions(
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
  readonly upload = injectMutation(() => ({
    mutationFn: ({ runId, file, metadata }: CiUploadRequest) =>
      this.ciImportsApi.uploadJUnitResults(
        this.workspaceSlug,
        this.projectSlug,
        runId,
        file,
        metadata,
      ),
    onSuccess: async (response) => {
      this.lastUpload.set(response);
      await this.imports.refetch();
    },
  }));

  async selectStatus(status?: ResultIngestionStatus): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: status ?? null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  resetUpload(): void {
    this.lastUpload.set(null);
    this.upload.reset();
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
}
