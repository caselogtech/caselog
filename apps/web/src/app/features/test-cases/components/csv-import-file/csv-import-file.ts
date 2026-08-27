import { ChangeDetectionStrategy, Component, output, signal, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Callout } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-csv-import-file',
  imports: [Callout, TranslocoPipe],
  templateUrl: './csv-import-file.html',
  styleUrl: './csv-import-file.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsvImportFile {
  readonly reading = input(false);
  readonly errorMessage = input('');
  readonly hasError = input(false);
  readonly fileSelected = output<File>();
  readonly dragActive = signal(false);

  handleFileInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    if (file) this.fileSelected.emit(file);
    inputElement.value = '';
  }

  handleDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) this.fileSelected.emit(file);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }
}
