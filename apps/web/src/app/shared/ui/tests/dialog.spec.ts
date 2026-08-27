import { TestBed } from '@angular/core/testing';
import { Dialog } from '../dialog/dialog';

describe('Dialog', () => {
  it('opens modally, defaults focus to cancel, and reports Escape as cancellation', async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() {
        this.removeAttribute('open');
      },
    });
    const showModal = vi
      .spyOn(HTMLDialogElement.prototype, 'showModal')
      .mockImplementation(function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute('open');
    });
    await TestBed.configureTestingModule({ imports: [Dialog] }).compileComponents();
    const fixture = TestBed.createComponent(Dialog);
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.componentRef.setInput('title', 'Cancel release?');
    fixture.componentRef.setInput('message', 'This cannot be undone.');
    fixture.componentRef.setInput('cancelLabel', 'Keep release');
    fixture.componentRef.setInput('confirmLabel', 'Cancel release');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog.querySelector('button[autofocus]')).not.toBeNull();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(cancelled).toHaveBeenCalledOnce();
  });
});
