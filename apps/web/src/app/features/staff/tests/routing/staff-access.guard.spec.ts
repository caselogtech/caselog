import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  provideRouter,
  Router,
  type RouterStateSnapshot,
  type UrlTree,
} from '@angular/router';
import { BrowserSession } from '../../../../core/auth/browser-session';
import { StaffApi } from '../../data-access/staff-api';
import { staffAccessGuard } from '../../routing/staff-access.guard';
import { StaffSession } from '../../state/staff-session';

const route = {} as ActivatedRouteSnapshot;
const state = { url: '/staff' } as RouterStateSnapshot;
const session = {
  operator: {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'owner@example.com',
    displayName: 'Cloud Owner',
    role: 'owner' as const,
    accessExpiresAt: '2099-09-03T12:00:00.000Z',
  },
};

describe('staffAccessGuard', () => {
  const staffApi = { session: vi.fn() };

  beforeEach(() => {
    staffApi.session.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: StaffApi, useValue: staffApi }],
    });
  });

  it('loads and stores an active operator before entering the console', async () => {
    TestBed.inject(BrowserSession).accessToken.set('access-token');
    staffApi.session.mockResolvedValue(session);

    const result = await TestBed.runInInjectionContext(() => staffAccessGuard(route, state));

    expect(result).toBe(true);
    expect(TestBed.inject(StaffSession).operator()).toEqual(session.operator);
  });

  it('redirects a non-operator to the forbidden state', async () => {
    TestBed.inject(BrowserSession).accessToken.set('access-token');
    staffApi.session.mockRejectedValue(
      new HttpErrorResponse({
        status: 403,
        error: { error: { code: 'insufficient_permissions' } },
      }),
    );

    const result = await TestBed.runInInjectionContext(() => staffAccessGuard(route, state));

    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/status/forbidden?returnUrl=%2Fstaff',
    );
  });

  it('redirects a signed-out visitor to login', async () => {
    TestBed.inject(BrowserSession).clear();

    const result = await TestBed.runInInjectionContext(() => staffAccessGuard(route, state));

    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/auth/login?returnUrl=%2Fstaff',
    );
  });
});
