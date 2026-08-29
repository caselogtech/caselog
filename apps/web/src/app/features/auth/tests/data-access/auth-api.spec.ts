import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApi } from '../../data-access/auth-api';

describe('AuthApi', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads deleted workspaces explicitly', async () => {
    const response = TestBed.inject(AuthApi).listWorkspaces('deleted');
    const request = TestBed.inject(HttpTestingController).expectOne(
      ({ url, params }) => url === '/api/v1/auth/workspaces' && params.get('status') === 'deleted',
    );
    expect(request.request.method).toBe('GET');
    request.flush({ workspaces: [deletedWorkspace()] });

    await expect(response).resolves.toMatchObject({
      workspaces: [{ name: 'Recoverable QA', deletedAt: '2026-08-27T22:00:00.000Z' }],
    });
  });

  it('restores a workspace through the account-scoped endpoint', async () => {
    const workspace = deletedWorkspace();
    const response = TestBed.inject(AuthApi).restoreWorkspace(workspace.id);
    const request = TestBed.inject(HttpTestingController).expectOne(
      `/api/v1/auth/workspaces/${workspace.id}/restore`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        deletedAt: null,
        recoverableUntil: null,
      },
    });

    await expect(response).resolves.toMatchObject({ workspace: { deletedAt: null } });
  });

  it('revokes the refresh session and includes credentials', async () => {
    const response = TestBed.inject(AuthApi).logout();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/logout');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null, { status: 204, statusText: 'No Content' });

    await expect(response).resolves.toBeUndefined();
  });
});

function deletedWorkspace() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    membershipId: '22222222-2222-4222-8222-222222222222',
    name: 'Recoverable QA',
    slug: 'recoverable-qa',
    role: 'owner',
    deletedAt: '2026-08-27T22:00:00.000Z',
    recoverableUntil: '2026-09-26T22:00:00.000Z',
  };
}
