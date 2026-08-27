import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ResultAttachmentResponse } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Callout } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-result-attachments',
  imports: [Button, Callout, TranslocoPipe],
  templateUrl: './result-attachments.html',
  styleUrl: './result-attachments.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultAttachments {
  readonly attachments = input.required<ReadonlyArray<ResultAttachmentResponse>>();
  readonly pending = input(false);
  readonly failed = input(false);
  readonly errorMessage = input('');

  readonly download = output<string>();

  formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1_024) return `${sizeBytes} B`;
    if (sizeBytes < 1_048_576) return `${(sizeBytes / 1_024).toFixed(1)} KB`;
    return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
  }
}
