import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CaseExecutionHistoryItem } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Button,
  Callout,
  LoadingSkeleton,
  StatusBadge,
  type StatusBadgeTone,
} from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-case-execution-history',
  imports: [Button, Callout, DatePipe, LoadingSkeleton, RouterLink, StatusBadge, TranslocoPipe],
  templateUrl: './case-execution-history.html',
  styleUrl: './case-execution-history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseExecutionHistory {
  readonly items = input.required<CaseExecutionHistoryItem[]>();
  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input.required<string>();
  readonly loading = input(false);
  readonly failed = input(false);
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  readonly errorMessage = input('');

  readonly retry = output<void>();
  readonly loadMore = output<void>();

  statusTone(statusKey: string): StatusBadgeTone {
    if (statusKey === 'passed') return 'success';
    if (['failed', 'blocked'].includes(statusKey)) return 'danger';
    if (['skipped', 'not_applicable'].includes(statusKey)) return 'neutral';
    if (['untested', 'in_progress'].includes(statusKey)) return 'pending';
    return 'unknown';
  }
}
