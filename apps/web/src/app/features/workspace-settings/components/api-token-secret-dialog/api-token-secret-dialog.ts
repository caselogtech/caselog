import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-api-token-secret-dialog',
  imports: [Button, TranslocoPipe],
  templateUrl: './api-token-secret-dialog.html',
  styleUrl: './api-token-secret-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiTokenSecretDialog {
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly token = input<string | null>(null);
  readonly tokenName = input('');
  readonly closed = output<void>();
  readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');

  constructor() {
    effect(() => {
      const token = this.token();
      const element = this.dialog().nativeElement;
      if (token && !element.open) {
        this.copyState.set('idle');
        element.showModal();
      }
      if (!token && element.open) element.close();
    });
  }

  async copy(): Promise<void> {
    const token = this.token();
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!token || !clipboard) {
      this.copyState.set('failed');
      return;
    }
    try {
      await clipboard.writeText(token);
      this.copyState.set('copied');
    } catch {
      this.copyState.set('failed');
    }
  }

  preventAccidentalClose(event: Event): void {
    event.preventDefault();
  }
}
