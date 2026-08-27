import { TestBed } from '@angular/core/testing';
import type { WorkspaceMember } from '@caselog/schemas';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { MemberList } from '../../../components/member-list/member-list';

const owner = member('owner', 'owner-user', 'Workspace Owner');
const tester = member('tester', 'tester-user', 'Workspace Tester');

describe('MemberList', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemberList, i18nTestingModule()],
    }).compileComponents();
  });

  it('offers an owner legal role, lifecycle and ownership actions', () => {
    const fixture = TestBed.createComponent(MemberList);
    const roleChange = vi.fn();
    const deactivation = vi.fn();
    const ownership = vi.fn();
    fixture.componentRef.setInput('members', [owner, tester]);
    fixture.componentRef.setInput('actorRole', 'owner');
    fixture.componentRef.setInput('actorUserId', owner.user.id);
    fixture.componentInstance.roleChangeRequested.subscribe(roleChange);
    fixture.componentInstance.deactivateRequested.subscribe(deactivation);
    fixture.componentInstance.ownershipRequested.subscribe(ownership);
    fixture.detectChanges();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows[0]?.textContent).toContain('No available actions');
    expect(rows[1]?.textContent).toContain('Deactivate');
    expect(rows[1]?.textContent).toContain('Transfer ownership');

    fixture.componentInstance.changeRole(tester, 'lead');
    expect(roleChange).toHaveBeenCalledWith({ member: tester, role: 'lead' });
  });

  it('prevents an admin from managing another admin', () => {
    const fixture = TestBed.createComponent(MemberList);
    fixture.componentRef.setInput('members', [member('admin', 'other-admin', 'Other Admin')]);
    fixture.componentRef.setInput('actorRole', 'admin');
    fixture.componentRef.setInput('actorUserId', 'current-admin');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('select')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No available actions');
  });
});

function member(
  role: WorkspaceMember['role'],
  userId: string,
  displayName: string,
): WorkspaceMember {
  return {
    membershipId: `${userId}-membership`,
    user: { id: userId, email: `${userId}@example.com`, displayName },
    role,
    state: 'active',
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
  };
}
