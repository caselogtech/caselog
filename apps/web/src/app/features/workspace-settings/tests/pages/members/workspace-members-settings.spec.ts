import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { WorkspaceInvitation, WorkspaceMember } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { BrowserSession } from '../../../../../core/auth/browser-session';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceAccess } from '../../../../workspace/public-api';
import { WorkspaceMembersApi } from '../../../data-access/workspace-members-api';
import { WorkspaceMembersSettings } from '../../../pages/members/workspace-members-settings';

const owner = member('owner', 'owner-user', 'Workspace Owner');
const tester = member('tester', 'tester-user', 'Workspace Tester');
const pendingInvitation: WorkspaceInvitation = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'invitee@example.com',
  role: 'tester',
  status: 'pending',
  expiresAt: '2026-09-03T12:00:00.000Z',
  createdAt: '2026-08-27T12:00:00.000Z',
  updatedAt: '2026-08-27T12:00:00.000Z',
  invitedBy: {
    id: owner.user.id,
    displayName: owner.user.displayName,
  },
};

describe('WorkspaceMembersSettings', () => {
  const membersApi = {
    members: vi.fn(),
    updateRole: vi.fn(),
    deactivate: vi.fn(),
    activate: vi.fn(),
    transferOwnership: vi.fn(),
    invitations: vi.fn(),
    createInvitations: vi.fn(),
    resendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
  };
  const workspaceAccess = { open: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    for (const mock of Object.values(membersApi)) mock.mockReset();
    membersApi.members.mockImplementation((_slug: string, state: 'active' | 'inactive') =>
      Promise.resolve({ items: state === 'active' ? [owner, tester] : [], nextCursor: null }),
    );
    membersApi.updateRole.mockResolvedValue({ member: { ...tester, role: 'lead' } });
    membersApi.deactivate.mockResolvedValue(undefined);
    membersApi.activate.mockResolvedValue({ member: { ...tester, state: 'active' } });
    membersApi.transferOwnership.mockResolvedValue({ member: { ...tester, role: 'owner' } });
    membersApi.invitations.mockResolvedValue({ items: [pendingInvitation], nextCursor: null });
    membersApi.createInvitations.mockResolvedValue({ invitations: [pendingInvitation] });
    membersApi.resendInvitation.mockResolvedValue({ invitation: pendingInvitation });
    membersApi.revokeInvitation.mockResolvedValue(undefined);
    workspaceAccess.open.mockReset();
    workspaceAccess.open.mockResolvedValue(organizationSession('owner'));
  });

  afterEach(() => queryClient.clear());

  it('renders active members and confirms deactivation before calling the API', async () => {
    await configure('active');
    const fixture = TestBed.createComponent(WorkspaceMembersSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.members.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Workspace Tester');
    fixture.componentInstance.requestDeactivate(tester);
    expect(fixture.componentInstance.deactivateTarget()).toEqual(tester);
    expect(membersApi.deactivate).not.toHaveBeenCalled();
    fixture.componentInstance.confirmDeactivate();

    await vi.waitFor(() =>
      expect(membersApi.deactivate).toHaveBeenCalledWith('acme', tester.membershipId),
    );
  });

  it('creates and revokes invitations through the invitation view', async () => {
    await configure('invitations');
    const fixture = TestBed.createComponent(WorkspaceMembersSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.invitations.isSuccess()).toBe(true));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('invitee@example.com');

    const request = { invitations: [{ email: 'second@example.com', role: 'tester' as const }] };
    fixture.componentInstance.createInvitation.mutate(request);
    await vi.waitFor(() =>
      expect(membersApi.createInvitations).toHaveBeenCalledWith('acme', request),
    );

    fixture.componentInstance.requestRevoke(pendingInvitation);
    expect(fixture.componentInstance.invitationConfirmation()?.action).toBe('revoke');
    fixture.componentInstance.confirmInvitationAction();
    await vi.waitFor(() =>
      expect(membersApi.revokeInvitation).toHaveBeenCalledWith('acme', pendingInvitation.id),
    );
  });

  it('refreshes organization access after transferring ownership', async () => {
    await configure('active');
    const nextSession = organizationSession('admin');
    workspaceAccess.open.mockImplementation(async () => {
      TestBed.inject(WorkspaceSession).start(nextSession);
      return nextSession;
    });
    const fixture = TestBed.createComponent(WorkspaceMembersSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.members.isSuccess()).toBe(true));

    fixture.componentInstance.transferOwnership.mutate(tester);

    await vi.waitFor(() =>
      expect(membersApi.transferOwnership).toHaveBeenCalledWith('acme', tester.membershipId),
    );
    await vi.waitFor(() => expect(workspaceAccess.open).toHaveBeenCalledWith('acme'));
    expect(TestBed.inject(WorkspaceSession).role()).toBe('admin');
  });

  async function configure(view: 'active' | 'invitations'): Promise<void> {
    const queryParams = new BehaviorSubject(convertToParamMap(view === 'active' ? {} : { view }));
    await TestBed.configureTestingModule({
      imports: [WorkspaceMembersSettings, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: WorkspaceMembersApi, useValue: membersApi },
        { provide: WorkspaceAccess, useValue: workspaceAccess },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ org: 'acme' }),
              queryParamMap: queryParams.value,
            },
            queryParamMap: queryParams.asObservable(),
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(BrowserSession).user.set({
      id: owner.user.id,
      email: owner.user.email,
      displayName: owner.user.displayName,
      emailVerified: true,
    });
    TestBed.inject(WorkspaceSession).start(organizationSession('owner'));
  }
});

function organizationSession(role: 'owner' | 'admin') {
  return {
    accessToken: 'workspace-token',
    expiresAt: '2099-08-27T22:00:00.000Z',
    organization: {
      id: '99999999-9999-4999-8999-999999999999',
      name: 'Acme QA',
      slug: 'acme',
    },
    role,
  } as const;
}

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
