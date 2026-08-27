import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import type { ProjectStructureResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Callout, FormControlStyle } from '../../../../shared/ui/public-api';
import type { CsvDelimiter } from '../../domain/csv-header';
import type { CsvImportMappingForm } from './csv-import-mapping-form';

@Component({
  selector: 'app-csv-import-mapping',
  imports: [Button, Callout, FormControlStyle, ReactiveFormsModule, TranslocoPipe],
  templateUrl: './csv-import-mapping.html',
  styleUrl: './csv-import-mapping.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsvImportMapping {
  readonly form = input.required<CsvImportMappingForm>();
  readonly file = input.required<File>();
  readonly columns = input.required<string[]>();
  readonly suites = input.required<ProjectStructureResponse['suites']>();
  readonly delimiter = input.required<CsvDelimiter>();
  readonly fileError = input(false);
  readonly previewError = input(false);
  readonly errorMessage = input('');
  readonly previewing = input(false);

  readonly replaceFile = output<void>();
  readonly delimiterChange = output<string>();
  readonly preview = output<void>();
}
