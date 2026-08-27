import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { CaseAttachment } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Callout, LoadingSkeleton } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-case-attachments-panel',
  imports: [Button, Callout, DatePipe, LoadingSkeleton, TranslocoPipe],
  templateUrl: './case-attachments-panel.html',
  styleUrl: './case-attachments-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseAttachmentsPanel {
  readonly items = input.required<CaseAttachment[]>();
  readonly canEdit = input(false);
  readonly loading = input(false);
  readonly failed = input(false);
  readonly uploading = input(false);
  readonly downloading = input(false);
  readonly actionFailed = input(false);
  readonly hasMore = input(false);
  readonly loadingMore = input(false);
  readonly errorMessage = input('');

  readonly upload = output<File>();
  readonly download = output<string>();
  readonly retry = output<void>();
  readonly loadMore = output<void>();

  selectFile(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.item(0);
    if (file) this.upload.emit(file);
    inputElement.value = '';
  }

  formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1_024) return `${sizeBytes} B`;
    if (sizeBytes < 1_048_576) return `${(sizeBytes / 1_024).toFixed(1)} KB`;
    return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
  }
}
