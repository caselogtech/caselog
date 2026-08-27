import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { TestRunDetailResponse, TestRunItemResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Button,
  Callout,
  FormControlStyle,
  FormField,
  StatusBadge,
  type StatusBadgeTone,
} from '../../../../shared/ui/public-api';
import { RunExecutionSession } from '../../state/run-execution-session';

type RunMember = TestRunDetailResponse['members'][number];
type ResultStatus = TestRunDetailResponse['statuses'][number];

@Component({
  selector: 'app-run-execution-panel',
  imports: [
    Button,
    Callout,
    FormControlStyle,
    FormField,
    ReactiveFormsModule,
    RouterLink,
    StatusBadge,
    TranslocoPipe,
  ],
  templateUrl: './run-execution-panel.html',
  styleUrl: './run-execution-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunExecutionPanel {
  readonly execution = inject(RunExecutionSession);

  readonly item = input.required<TestRunItemResponse>();
  readonly members = input.required<RunMember[]>();
  readonly statuses = input.required<ResultStatus[]>();
  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input.required<string>();
  readonly runId = input.required<string>();
  readonly canManage = input(false);
  readonly canExecute = input(false);
  readonly assignmentPending = input(false);
  readonly resultPending = input(false);

  readonly assignmentChanged = output<{ itemId: string; assigneeId: string }>();
  readonly resultRecorded = output<string>();

  steps(): Array<{ action: string; expected?: string }> {
    const content = this.item().caseVersion.content;
    return 'steps' in content ? content.steps : [];
  }

  textContent(): string {
    const content = this.item().caseVersion.content;
    if ('text' in content) return content.text;
    if ('charter' in content) return content.charter;
    if ('gherkin' in content) return content.gherkin;
    return '';
  }

  chooseStepStatus(position: number, statusId: string): void {
    this.execution.chooseStepStatus(position, statusId);
  }

  isStepStatusSelected(position: number, statusId: string): boolean {
    return this.execution.isStepStatusSelected(position, statusId);
  }

  currentStatusTone(): StatusBadgeTone {
    const key = this.item().status.key;
    if (key === 'passed') return 'success';
    if (key === 'failed' || key === 'blocked') return 'danger';
    if (key === 'untested' || key === 'in_progress') return 'pending';
    return 'neutral';
  }
}
