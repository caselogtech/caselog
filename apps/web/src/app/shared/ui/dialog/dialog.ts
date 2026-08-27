import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Button } from '../button/button';

@Component({
  selector: 'app-dialog',
  imports: [Button],
  template: `
    <dialog #dialog aria-labelledby="app-dialog-title" (cancel)="cancel($event)">
      <div class="dialog-body">
        <h2 id="app-dialog-title">{{ title() }}</h2>
        <p>{{ message() }}</p>
      </div>
      <div class="dialog-actions">
        <button appButton="secondary" type="button" autofocus (click)="cancelled.emit()">
          {{ cancelLabel() }}
        </button>
        <button [appButton]="confirmVariant()" type="button" (click)="confirmed.emit()">
          {{ confirmLabel() }}
        </button>
      </div>
    </dialog>
  `,
  styleUrl: './dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly open = input(false);
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input.required<string>();
  readonly confirmVariant = input<'primary' | 'danger'>('primary');
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) element.showModal();
      if (!this.open() && element.open) element.close();
    });
  }

  cancel(event: Event): void {
    event.preventDefault();
    this.cancelled.emit();
  }
}
