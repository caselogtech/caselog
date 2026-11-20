import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { sessionAuthInterceptor } from '../../../../core/auth/session-auth.interceptor';
import { userDetail } from '../support/staff-user.fixture';
import { workspaceDetail } from '../support/staff-workspace.fixture';
import { StaffApi } from '../../data-access/staff-api';

describe('StaffApi', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([sessionAuthInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(BrowserSession).accessToken.set('browser-access-token');
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('uses the browser session for paginated staff directories', async () => {
    const response = TestBed.inject(StaffApi).users({
      cursor: '11111111-1111-4111-8111-111111111111',
      limit: 10,
      q: 'owner',
    });
    const request = TestBed.inject(HttpTestingController).expectOne(
      ({ url }) => url === '/api/v1/staff/users',
    );
    expect(request.request.headers.get('Authorization')).toBe('Bearer browser-access-token');
    expect(request.request.params.get('cursor')).toBe('11111111-1111-4111-8111-111111111111');
    expect(request.request.params.get('limit')).toBe('10');
    expect(request.request.params.get('q')).toBe('owner');
    request.flush({ users: [], nextCursor: null });

    await expect(response).resolves.toEqual({ users: [], nextCursor: null });
  });

  it('validates workspace snapshots and uses the session token', async () => {
    const response = TestBed.inject(StaffApi).workspaceDetail(workspaceDetail.workspace.id);
    const request = TestBed.inject(HttpTestingController).expectOne(
      `/api/v1/staff/workspaces/${workspaceDetail.workspace.id}`,
    );
    expect(request.request.headers.get('Authorization')).toBe('Bearer browser-access-token');
    request.flush(workspaceDetail);
    await expect(response).resolves.toEqual(workspaceDetail);
  });

  it('forwards lifecycle filtering and validates owner contacts', async () => {
    const response = TestBed.inject(StaffApi).workspaces({
      state: 'current',
      q: 'owner@example.com',
    });
    const request = TestBed.inject(HttpTestingController).expectOne(
      ({ url }) => url === '/api/v1/staff/workspaces',
    );
    expect(request.request.params.get('state')).toBe('current');
    request.flush({ workspaces: [workspaceDetail.workspace], nextCursor: null });
    await expect(response).resolves.toMatchObject({
      workspaces: [{ owner: workspaceDetail.workspace.owner }],
    });
  });

  it('rejects malformed usage from the API', async () => {
    const response = TestBed.inject(StaffApi).workspaceDetail(workspaceDetail.workspace.id);
    const check = expect(response).rejects.toThrow();
    TestBed.inject(HttpTestingController)
      .expectOne(`/api/v1/staff/workspaces/${workspaceDetail.workspace.id}`)
      .flush({ ...workspaceDetail, usage: { ...workspaceDetail.usage, testRuns: -1 } });
    await check;
  });

  it('validates user cards and forwards bounded membership pagination with the session token', async () => {
    const response = TestBed.inject(StaffApi).userDetail(userDetail.user.id, {
      limit: 1,
      cursor: userDetail.nextCursor ?? undefined,
    });
    const request = TestBed.inject(HttpTestingController).expectOne(
      ({ url }) => url === `/api/v1/staff/users/${userDetail.user.id}`,
    );
    expect(request.request.headers.get('Authorization')).toBe('Bearer browser-access-token');
    expect(request.request.params.get('limit')).toBe('1');
    expect(request.request.params.get('cursor')).toBe(userDetail.nextCursor);
    request.flush(userDetail);
    await expect(response).resolves.toEqual(userDetail);
  });

  it('rejects unexpected workspace role values in user cards', async () => {
    const response = TestBed.inject(StaffApi).userDetail(userDetail.user.id);
    const check = expect(response).rejects.toThrow();
    TestBed.inject(HttpTestingController)
      .expectOne(({ url }) => url === `/api/v1/staff/users/${userDetail.user.id}`)
      .flush({ ...userDetail, workspaces: [{ ...userDetail.workspaces[0], role: 'superuser' }] });
    await check;
  });

  it('sends the required reason when revoking an operator', async () => {
    const userId = '22222222-2222-4222-8222-222222222222';
    const response = TestBed.inject(StaffApi).revokeOperator(userId, {
      reason: 'Access is no longer required',
    });
    const request = TestBed.inject(HttpTestingController).expectOne(
      `/api/v1/staff/operators/${userId}`,
    );
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ reason: 'Access is no longer required' });
    request.flush(null, { status: 204, statusText: 'No Content' });

    await expect(response).resolves.toBeUndefined();
  });
});
