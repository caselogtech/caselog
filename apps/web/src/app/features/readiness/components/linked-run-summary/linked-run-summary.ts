import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CandidateTestRun, TestRunStatus } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusBadge, type StatusBadgeTone } from '../../../../shared/ui/public-api';

const STATUS_LABEL: Record<TestRunStatus, string> = {
  draft: 'readiness.linkedRuns.statuses.draft',
  active: 'readiness.linkedRuns.statuses.active',
  completed: 'readiness.linkedRuns.statuses.completed',
  archived: 'readiness.linkedRuns.statuses.archived',
};

const STATUS_TONE: Record<TestRunStatus, StatusBadgeTone> = {
  draft: 'neutral',
  active: 'pending',
  completed: 'success',
  archived: 'neutral',
};

@Component({
  selector: 'app-linked-run-summary',
  imports: [RouterLink, StatusBadge, TranslocoPipe],
  templateUrl: './linked-run-summary.html',
  styleUrl: './linked-run-summary.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkedRunSummary {
  readonly runs = input.required<readonly CandidateTestRun[]>();
  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input.required<string>();
  readonly releaseId = input.required<string>();
  readonly candidateId = input.required<string>();

  statusLabel(status: TestRunStatus): string {
    return STATUS_LABEL[status];
  }

  statusTone(status: TestRunStatus): StatusBadgeTone {
    return STATUS_TONE[status];
  }
}
