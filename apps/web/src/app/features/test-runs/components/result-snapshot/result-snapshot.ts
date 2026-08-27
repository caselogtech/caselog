import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { StepResultResponse, TestRunItemResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatusBadge, type StatusBadgeTone } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-result-snapshot',
  imports: [StatusBadge, TranslocoPipe],
  templateUrl: './result-snapshot.html',
  styleUrl: './result-snapshot.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultSnapshot {
  readonly item = input.required<TestRunItemResponse>();
  readonly stepResults = input.required<ReadonlyArray<StepResultResponse>>();

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

  stepResult(position: number): StepResultResponse | undefined {
    return this.stepResults().find((result) => result.position === position);
  }

  formatElapsed(elapsedMs: number): string {
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
