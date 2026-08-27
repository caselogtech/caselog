import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ResultIngestionListResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';

type ImportSummary = ResultIngestionListResponse['summary'];

@Component({
  selector: 'app-ci-import-summary',
  imports: [TranslocoPipe],
  templateUrl: './ci-import-summary.html',
  styleUrl: './ci-import-summary.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CiImportSummary {
  readonly summary = input.required<ImportSummary>();
}
