import { DatePipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import {
  Button,
  LoadingSkeleton,
  PageState,
  StatusBadge,
  type StatusBadgeTone,
} from '../../../../shared/ui/public-api';
import { ResultAttachments } from '../../components/result-attachments/result-attachments';
import { ResultSnapshot } from '../../components/result-snapshot/result-snapshot';
import { TestRunsApi } from '../../data-access/test-runs-api';

@Component({
  selector: 'app-result-detail',
  imports: [
    Button,
    DatePipe,
    LoadingSkeleton,
    PageState,
    ResultAttachments,
    ResultSnapshot,
    RouterLink,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './result-detail.html',
  styleUrl: './result-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly testRunsApi = inject(TestRunsApi);
  private readonly document = inject(DOCUMENT);

  readonly workspaceSlug = this.route.snapshot.paramMap.get('org') ?? '';
  readonly projectSlug = this.route.snapshot.paramMap.get('project') ?? '';
  readonly runId = this.route.snapshot.paramMap.get('runId') ?? '';
  readonly itemId = this.route.snapshot.paramMap.get('itemId') ?? '';
  readonly resultId = this.route.snapshot.paramMap.get('resultId') ?? '';

  readonly detail = injectQuery(() => ({
    queryKey: [
      'test-result',
      this.workspaceSlug,
      this.projectSlug,
      this.runId,
      this.itemId,
      this.resultId,
    ],
    queryFn: () =>
      this.testRunsApi.testResult(
        this.workspaceSlug,
        this.projectSlug,
        this.runId,
        this.itemId,
        this.resultId,
      ),
  }));

  readonly downloadAttachment = injectMutation(() => ({
    mutationFn: (attachmentId: string) =>
      this.testRunsApi.testResultAttachmentDownload(
        this.workspaceSlug,
        this.projectSlug,
        this.runId,
        this.itemId,
        this.resultId,
        attachmentId,
      ),
    onSuccess: ({ download }) => this.openDownload(download.url),
  }));

  formatElapsed(elapsedMs: number | null): string {
    if (elapsedMs === null) return '—';
    if (elapsedMs < 1_000) return `${elapsedMs} ms`;
    return `${elapsedMs / 1_000} s`;
  }

  statusTone(statusKey: string): StatusBadgeTone {
    if (statusKey === 'passed') return 'success';
    if (statusKey === 'failed' || statusKey === 'blocked') return 'danger';
    if (statusKey === 'untested' || statusKey === 'in_progress') return 'pending';
    if (statusKey === 'skipped' || statusKey === 'not_applicable') return 'neutral';
    return 'unknown';
  }

  detailErrorTranslationKey(): string {
    return apiErrorTranslationKey(this.detail.error());
  }

  attachmentErrorTranslationKey(): string {
    return apiErrorTranslationKey(this.downloadAttachment.error());
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
