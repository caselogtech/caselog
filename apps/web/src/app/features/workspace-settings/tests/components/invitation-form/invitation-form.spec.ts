import { TestBed } from '@angular/core/testing';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { InvitationForm } from '../../../components/invitation-form/invitation-form';

describe('InvitationForm', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvitationForm, i18nTestingModule()],
    }).compileComponents();
  });

  it('normalizes a valid owner invitation', () => {
    const fixture = TestBed.createComponent(InvitationForm);
    const submitted = vi.fn();
    fixture.componentRef.setInput('actorRole', 'owner');
    fixture.componentInstance.submitted.subscribe(submitted);
    fixture.componentInstance.form.setValue({
      email: 'Invitee@Example.COM',
      role: 'admin',
    });

    fixture.componentInstance.submit();

    expect(submitted).toHaveBeenCalledWith({
      invitations: [{ email: 'invitee@example.com', role: 'admin' }],
    });
  });

  it('does not offer the admin role to an admin actor', () => {
    const fixture = TestBed.createComponent(InvitationForm);
    fixture.componentRef.setInput('actorRole', 'admin');
    fixture.detectChanges();

    const values = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>('option'),
      (option) => option.value,
    );
    expect(values).not.toContain('admin');
  });
});
