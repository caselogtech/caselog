import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WorkspaceAccess } from '../../../workspace/public-api';
import { WorkspaceMembersApi } from '../../data-access/workspace-members-api';

describe('WorkspaceMembersApi', () => {
  const workspaceAccess = { open: vi.fn() };

  beforeEach(() => {
    workspaceAccess.open.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WorkspaceAccess, useValue: workspaceAccess },
      ],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists cursor-paginated members with an explicit lifecycle state', async () => {
    const response = TestBed.inject(WorkspaceMembersApi).members(
      'acme',
      'inactive',
      '22222222-2222-4222-8222-222222222222',
    );
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne(
      ({ url, params }) =>
        url === '/api/v1/members' &&
        params.get('state') === 'inactive' &&
        params.get('limit') === '25' &&
        params.get('cursor') === '22222222-2222-4222-8222-222222222222',
    );
    request.flush({ items: [{ ...member(), state: 'inactive' }], nextCursor: null });

    await expect(response).resolves.toMatchObject({ items: [{ state: 'inactive' }] });
    expect(workspaceAccess.open).toHaveBeenCalledWith('acme');
  });

  it('uses dedicated role and lifecycle mutation endpoints', async () => {
    const api = TestBed.inject(WorkspaceMembersApi);
    const http = TestBed.inject(HttpTestingController);
    const membershipId = member().membershipId;

    const changed = api.updateRole('acme', membershipId, 'tester');
    await Promise.resolve();
    const roleRequest = http.expectOne(`/api/v1/members/${membershipId}`);
    expect(roleRequest.request.method).toBe('PATCH');
    expect(roleRequest.request.body).toEqual({ role: 'tester' });
    roleRequest.flush({ member: { ...member(), role: 'tester' } });
    await expect(changed).resolves.toMatchObject({ member: { role: 'tester' } });

    const deactivated = api.deactivate('acme', membershipId);
    await Promise.resolve();
    const deactivateRequest = http.expectOne(`/api/v1/members/${membershipId}`);
    expect(deactivateRequest.request.method).toBe('DELETE');
    deactivateRequest.flush(null);
    await expect(deactivated).resolves.toBeUndefined();

    const activated = api.activate('acme', membershipId);
    await Promise.resolve();
    const activateRequest = http.expectOne(`/api/v1/members/${membershipId}/activate`);
    expect(activateRequest.request.method).toBe('POST');
    activateRequest.flush({ member: member() });
    await expect(activated).resolves.toMatchObject({ member: { state: 'active' } });
  });

  it('transfers ownership only through the explicit command endpoint', async () => {
    const membershipId = member().membershipId;
    const response = TestBed.inject(WorkspaceMembersApi).transferOwnership('acme', membershipId);
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne(
      `/api/v1/members/${membershipId}/transfer-ownership`,
    );
    expect(request.request.method).toBe('POST');
    request.flush({ member: { ...member(), role: 'owner' } });

    await expect(response).resolves.toMatchObject({ member: { role: 'owner' } });
  });

  it('manages invitation creation, rotation and revocation without exposing tokens', async () => {
    const api = TestBed.inject(WorkspaceMembersApi);
    const http = TestBed.inject(HttpTestingController);
    const created = api.createInvitations('acme', {
      invitations: [{ email: 'invitee@example.com', role: 'tester' }],
    });
    await Promise.resolve();
    const createRequest = http.expectOne('/api/v1/members/invitations');
    expect(createRequest.request.method).toBe('POST');
    createRequest.flush({ invitations: [invitation()] });
    await expect(created).resolves.toMatchObject({
      invitations: [{ email: 'invitee@example.com' }],
    });

    const listed = api.invitations('acme');
    await Promise.resolve();
    const listRequest = http.expectOne(
      ({ url, params }) => url === '/api/v1/members/invitations' && params.get('status') === 'all',
    );
    listRequest.flush({ items: [invitation()], nextCursor: null });
    await expect(listed).resolves.toMatchObject({ items: [{ status: 'pending' }] });

    const resent = api.resendInvitation('acme', invitation().id);
    await Promise.resolve();
    http
      .expectOne(`/api/v1/members/invitations/${invitation().id}/resend`)
      .flush({ invitation: invitation() });
    await expect(resent).resolves.toMatchObject({ invitation: { status: 'pending' } });

    const revoked = api.revokeInvitation('acme', invitation().id);
    await Promise.resolve();
    const revokeRequest = http.expectOne(`/api/v1/members/invitations/${invitation().id}`);
    expect(revokeRequest.request.method).toBe('DELETE');
    revokeRequest.flush(null);
    await expect(revoked).resolves.toBeUndefined();
  });
});

function member() {
  return {
    membershipId: '11111111-1111-4111-8111-111111111111',
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'member@example.com',
      displayName: 'Workspace Member',
    },
    role: 'lead',
    state: 'active',
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
  };
}

function invitation() {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'invitee@example.com',
    role: 'tester',
    status: 'pending',
    expiresAt: '2026-09-03T12:00:00.000Z',
    createdAt: '2026-08-27T12:00:00.000Z',
    updatedAt: '2026-08-27T12:00:00.000Z',
    invitedBy: {
      id: '55555555-5555-4555-8555-555555555555',
      displayName: 'Workspace Owner',
    },
  };
}
