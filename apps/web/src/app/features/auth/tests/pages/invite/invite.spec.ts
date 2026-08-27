import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import type {
  AcceptWorkspaceInvitationResponse,
  SessionResponse,
  WorkspaceInvitationPreview,
} from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BrowserSession } from '../../../../../core/auth/browser-session';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { AuthApi } from '../../../data-access/auth-api';
import { WorkspaceInvitation } from '../../../pages/invite/invite';

const token = `clgi_65f3ec68-2560-46bf-8845-8b10c7ce8ec1_${'a'.repeat(43)}`;
const preview: WorkspaceInvitationPreview = {
  email: 'invitee@example.com',
  role: 'tester',
  expiresAt: '2026-09-03T12:00:00.000Z',
  workspace: {
    id: '65f3ec68-2560-46bf-8845-8b10c7ce8ec1',
    name: 'Northstar Labs',
    slug: 'northstar-labs',
  },
  invitedBy: {
    id: 'b51d0d90-12c1-4e23-9b89-7c645bd651a0',
    displayName: 'Workspace Owner',
  },
};
const accepted: AcceptWorkspaceInvitationResponse = {
  workspace: preview.workspace,
  membershipId: '8ee33880-ee3f-4fc2-bf07-c0064271427e',
  role: 'tester',
};

function session(email: string): SessionResponse {
  return {
    accessToken: 'access-token',
    expiresAt: '2026-08-27T21:00:00.000Z',
    user: {
      id: 'e1243c05-c62a-4f74-9719-ae8e498cbfcc',
      email,
      displayName: 'Invitee',
      emailVerified: false,
    },
  };
}

describe('WorkspaceInvitation', () => {
  const authApi = {
    invitationPreview: vi.fn(),
    acceptInvitation: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    authApi.invitationPreview.mockReset();
    authApi.acceptInvitation.mockReset();
    authApi.invitationPreview.mockResolvedValue(preview);
    await TestBed.configureTestingModule({
      imports: [WorkspaceInvitation, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: AuthApi, useValue: authApi },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ token }) } },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('shows the invitation context and keeps the token in a local sign-in return URL', async () => {
    const fixture = TestBed.createComponent(WorkspaceInvitation);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.preview.isSuccess()).toBe(true));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Northstar Labs');
    expect(text).toContain('Workspace Owner');
    expect(text).toContain('Tester');
    expect(text).toContain('invitee@example.com');
    expect(
      fixture.nativeElement.querySelector('.invitation-action.primary')?.getAttribute('href'),
    ).toContain(`returnUrl=%2Fauth%2Finvite%2F${token}`);
  });

  it('accepts for the matching browser account and enters the workspace', async () => {
    TestBed.inject(BrowserSession).start(session('INVITEE@example.com'));
    authApi.acceptInvitation.mockResolvedValue(accepted);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const fixture = TestBed.createComponent(WorkspaceInvitation);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.preview.isSuccess()).toBe(true));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('button').click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/', 'northstar-labs']));

    expect(authApi.acceptInvitation).toHaveBeenCalledWith(token);
  });

  it('refuses acceptance in the browser for a different signed-in account', async () => {
    TestBed.inject(BrowserSession).start(session('someone-else@example.com'));
    const fixture = TestBed.createComponent(WorkspaceInvitation);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.preview.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.warning-message')?.textContent).toContain(
      'invitee@example.com',
    );
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(authApi.acceptInvitation).not.toHaveBeenCalled();
  });
});
