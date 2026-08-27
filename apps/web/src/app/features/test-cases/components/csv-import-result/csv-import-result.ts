import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CsvImportResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-csv-import-result',
  imports: [Button, RouterLink, TranslocoPipe],
  templateUrl: './csv-import-result.html',
  styleUrl: './csv-import-result.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsvImportResult {
  readonly result = input.required<CsvImportResponse>();
  readonly projectKey = input.required<string>();
  readonly workspaceSlug = input.required<string>();
  readonly projectSlug = input.required<string>();
  readonly importAnother = output<void>();
}
