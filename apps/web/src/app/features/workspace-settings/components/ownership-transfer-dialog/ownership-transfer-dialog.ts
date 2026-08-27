import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { WorkspaceMember } from '@caselog/schemas';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, FormControlStyle, FormField } from '../../../../shared/ui/public-api';

@Component({
  selector: 'app-ownership-transfer-dialog',
  imports: [Button, FormControlStyle, FormField, TranslocoPipe],
  templateUrl: './ownership-transfer-dialog.html',
  styleUrl: './ownership-transfer-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnershipTransferDialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly open = input(false);
  readonly member = input<WorkspaceMember | null>(null);
  readonly workspaceName = input.required<string>();
  readonly pending = input(false);
  readonly confirmed = output<WorkspaceMember>();
  readonly cancelled = output<void>();
  readonly confirmation = signal('');
  readonly matches = computed(() => this.confirmation() === this.workspaceName());

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        this.confirmation.set('');
        element.showModal();
      }
      if (!this.open() && element.open) element.close();
    });
  }

  confirm(): void {
    const member = this.member();
    if (member && this.matches() && !this.pending()) this.confirmed.emit(member);
  }

  cancel(event?: Event): void {
    event?.preventDefault();
    if (!this.pending()) this.cancelled.emit();
  }
}
