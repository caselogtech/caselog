import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { RunProgressResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-run-progress-report',
  imports: [TranslocoPipe],
  templateUrl: './run-progress-report.html',
  styleUrl: './run-progress-report.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunProgressReport {
  readonly report = input.required<RunProgressResponse>();
}
