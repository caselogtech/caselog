import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TestResultResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, StatusBadge, type StatusBadgeTone } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-result-attempt-list',
  imports: [Button, DatePipe, RouterLink, StatusBadge, TranslocoPipe],
  templateUrl: './result-attempt-list.html',
  styleUrl: './result-attempt-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultAttemptList {
  readonly results = input.required<ReadonlyArray<TestResultResponse>>();
  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input.required<string>();
  readonly runId = input.required<string>();
  readonly itemId = input.required<string>();
  readonly hasNextPage = input(false);
  readonly fetchingNextPage = input(false);

  readonly loadMore = output<void>();

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
}
