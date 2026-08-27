import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  CandidateTestRun,
  CandidateTestRunRole,
  TestRunStatus,
  TestRunSummary,
} from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Button,
  Dialog,
  FormControlStyle,
  LoadingSkeleton,
  StatusBadge,
  type StatusBadgeTone,
} from '../../../../shared/ui/public-api';

export type CandidateRunLinkRequest = {
  candidateId: string;
  runId: string;
  role: CandidateTestRunRole;
};

export type CandidateRunUnlinkRequest = {
  candidateId: string;
  runId: string;
};

const STATUS_LABEL: Record<TestRunStatus, string> = {
  draft: 'workspace.runs.statuses.draft',
  active: 'workspace.runs.statuses.active',
  completed: 'workspace.runs.statuses.completed',
  archived: 'workspace.runs.statuses.archived',
};

const STATUS_TONE: Record<TestRunStatus, StatusBadgeTone> = {
  draft: 'neutral',
  active: 'pending',
  completed: 'success',
  archived: 'neutral',
};

@Component({
  selector: 'app-candidate-run-manager',
  imports: [
    Button,
    Dialog,
    FormControlStyle,
    LoadingSkeleton,
    ReactiveFormsModule,
    RouterLink,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './candidate-run-manager.html',
  styleUrl: './candidate-run-manager.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CandidateRunManager {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly candidateId = input.required<string>();
  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input.required<string>();
  readonly links = input.required<readonly CandidateTestRun[]>();
  readonly runs = input.required<readonly TestRunSummary[]>();
  readonly canManage = input(false);
  readonly mutable = input(false);
  readonly loadingRuns = input(false);
  readonly pending = input(false);
  readonly linkRequested = output<CandidateRunLinkRequest>();
  readonly unlinkRequested = output<CandidateRunUnlinkRequest>();
  readonly unlinking = signal<CandidateTestRun | null>(null);
  readonly form = this.formBuilder.group({
    runId: ['', Validators.required],
    role: this.formBuilder.control<CandidateTestRunRole>('required'),
  });
  readonly availableRuns = computed(() => {
    const linkedIds = new Set(this.links().map(({ testRunId }) => testRunId));
    return this.runs().filter(({ id }) => !linkedIds.has(id));
  });

  statusLabel(status: TestRunStatus): string {
    return STATUS_LABEL[status];
  }

  statusTone(status: TestRunStatus): StatusBadgeTone {
    return STATUS_TONE[status];
  }

  requestLink(): void {
    if (!this.canManage() || !this.mutable() || this.pending() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { runId, role } = this.form.getRawValue();
    this.linkRequested.emit({ candidateId: this.candidateId(), runId, role });
  }

  updateRole(runId: string, role: CandidateTestRunRole): void {
    if (this.canManage() && this.mutable() && !this.pending()) {
      this.linkRequested.emit({ candidateId: this.candidateId(), runId, role });
    }
  }

  confirmUnlink(): void {
    const link = this.unlinking();
    this.unlinking.set(null);
    if (link) {
      this.unlinkRequested.emit({ candidateId: this.candidateId(), runId: link.testRunId });
    }
  }
}
