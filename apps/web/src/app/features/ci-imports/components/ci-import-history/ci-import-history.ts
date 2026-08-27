import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ResultIngestion, ResultIngestionStatus } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Button,
  LoadingSkeleton,
  PageState,
  StatusBadge,
  type StatusBadgeTone,
} from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-ci-import-history',
  imports: [Button, DatePipe, LoadingSkeleton, PageState, RouterLink, StatusBadge, TranslocoPipe],
  templateUrl: './ci-import-history.html',
  styleUrl: './ci-import-history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CiImportHistory {
  readonly items = input.required<ReadonlyArray<ResultIngestion>>();
  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input.required<string>();
  readonly status = input<ResultIngestionStatus>();
  readonly loading = input(false);
  readonly failed = input(false);
  readonly errorMessage = input('');
  readonly hasNextPage = input(false);
  readonly fetchingNextPage = input(false);

  readonly statusChanged = output<ResultIngestionStatus | undefined>();
  readonly retry = output<void>();
  readonly loadMore = output<void>();

  matchedPercent(item: ResultIngestion): number {
    return item.total === 0 ? 0 : Math.round((item.recorded / item.total) * 100);
  }

  statusLabelKey(item: ResultIngestion): string {
    if (item.status === 'failed') return 'workspace.automation.parseError';
    if (item.unmatched > 0) return 'workspace.automation.unmatchedCount';
    return 'workspace.automation.matched';
  }

  statusTone(item: ResultIngestion): StatusBadgeTone {
    if (item.status === 'failed') return 'danger';
    if (item.unmatched > 0) return 'warning';
    return 'success';
  }
}
