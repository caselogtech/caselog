import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-csv-import-progress',
  imports: [TranslocoPipe],
  templateUrl: './csv-import-progress.html',
  styleUrl: './csv-import-progress.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsvImportProgress {
  readonly currentStep = input.required<1 | 2 | 3>();
}
