import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { sessionAuthInterceptor } from '../../../../core/auth/session-auth.interceptor';
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
