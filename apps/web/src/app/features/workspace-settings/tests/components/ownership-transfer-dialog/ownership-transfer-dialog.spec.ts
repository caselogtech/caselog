import { TestBed } from '@angular/core/testing';
import type { WorkspaceMember } from '@caselog/schemas';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { OwnershipTransferDialog } from '../../../components/ownership-transfer-dialog/ownership-transfer-dialog';

const target: WorkspaceMember = {
  membershipId: '11111111-1111-4111-8111-111111111111',
  user: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'next-owner@example.com',
    displayName: 'Next Owner',
  },
  role: 'admin',
  state: 'active',
  createdAt: '2026-08-20T12:00:00.000Z',
  updatedAt: '2026-08-20T12:00:00.000Z',
};

describe('OwnershipTransferDialog', () => {
  beforeEach(async () => {
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
    await TestBed.configureTestingModule({
      imports: [OwnershipTransferDialog, i18nTestingModule()],
    }).compileComponents();
  });

  it('requires the exact workspace name and keeps cancel as the default focus', () => {
    const fixture = TestBed.createComponent(OwnershipTransferDialog);
    const confirmed = vi.fn();
    fixture.componentRef.setInput('workspaceName', 'Acme QA');
    fixture.componentRef.setInput('member', target);
    fixture.componentRef.setInput('open', true);
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.detectChanges();

    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog');
    expect(dialog?.querySelector('button[autofocus]')).not.toBeNull();
    fixture.componentInstance.confirmation.set('acme qa');
    fixture.componentInstance.confirm();
    expect(confirmed).not.toHaveBeenCalled();

    fixture.componentInstance.confirmation.set('Acme QA');
    fixture.componentInstance.confirm();
    expect(confirmed).toHaveBeenCalledWith(target);
  });
});
