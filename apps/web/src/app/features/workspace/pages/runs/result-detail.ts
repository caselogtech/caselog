import { DatePipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { StepResultResponse, TestRunItemResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { injectMutation, injectQuery } from '@tanstack/angular-query-experimental';
import { apiErrorTranslationKey } from '../../../../shared/api/api-error';
import { WorkspaceApi } from '../../data-access/workspace-api';

@Component({
  selector: 'app-result-detail',
  imports: [DatePipe, RouterLink, TranslocoPipe],
  templateUrl: './result-detail.html',
  styleUrl: './result-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly workspaceApi = inject(WorkspaceApi);
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
      this.workspaceApi.testResult(
        this.workspaceSlug,
        this.projectSlug,
        this.runId,
        this.itemId,
        this.resultId,
      ),
  }));

  readonly downloadAttachment = injectMutation(() => ({
    mutationFn: (attachmentId: string) =>
      this.workspaceApi.testResultAttachmentDownload(
        this.workspaceSlug,
        this.projectSlug,
        this.runId,
        this.itemId,
        this.resultId,
        attachmentId,
      ),
    onSuccess: ({ download }) => this.openDownload(download.url),
  }));

  steps(item: TestRunItemResponse): Array<{ action: string; expected?: string }> {
    return 'steps' in item.caseVersion.content ? item.caseVersion.content.steps : [];
  }

  textContent(item: TestRunItemResponse): string {
    const content = item.caseVersion.content;
    if ('text' in content) return content.text;
    if ('charter' in content) return content.charter;
    if ('gherkin' in content) return content.gherkin;
    return '';
  }

  stepResult(position: number, results: StepResultResponse[]): StepResultResponse | undefined {
    return results.find((result) => result.position === position);
  }

  formatElapsed(elapsedMs: number | null): string {
    if (elapsedMs === null) return '—';
    if (elapsedMs < 1_000) return `${elapsedMs} ms`;
    return `${elapsedMs / 1_000} s`;
  }

  formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1_024) return `${sizeBytes} B`;
    if (sizeBytes < 1_048_576) return `${(sizeBytes / 1_024).toFixed(1)} KB`;
    return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
  }

  errorTranslationKey(): string {
    return apiErrorTranslationKey(this.downloadAttachment.error() ?? this.detail.error());
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
