import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  Router,
  type RouterStateSnapshot,
  type UrlTree,
} from '@angular/router';
import type { OrganizationTokenResponse } from '@caselog/schemas';
import { WorkspaceAccess } from '../../data-access/workspace-access';
import { requireWorkspacePermission } from '../../routing/workspace-permission.guard';

const session = (role: OrganizationTokenResponse['role']): OrganizationTokenResponse => ({
  accessToken: 'access-token',
  expiresAt: '2026-08-29T12:00:00.000Z',
  organization: {
    id: '28bebd50-e43c-474a-959b-603f8763feba',
    name: 'Acme',
    slug: 'acme',
  },
  role,
});

describe('requireWorkspacePermission', () => {
  const workspaceAccess = { open: vi.fn() };
  const route = {
    paramMap: convertToParamMap({ org: 'acme' }),
  } as ActivatedRouteSnapshot;
  const state = { url: '/acme/checkout/releases/new' } as RouterStateSnapshot;

  beforeEach(() => {
    workspaceAccess.open.mockReset();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: WorkspaceAccess, useValue: workspaceAccess }],
    });
  });

  it('allows a role that satisfies the route contract', async () => {
    workspaceAccess.open.mockResolvedValue(session('lead'));

    const result = await TestBed.runInInjectionContext(() =>
      requireWorkspacePermission('lead')(route, state),
    );

    expect(result).toBe(true);
    expect(workspaceAccess.open).toHaveBeenCalledWith('acme');
  });

  it('redirects an insufficient role to the forbidden state', async () => {
    workspaceAccess.open.mockResolvedValue(session('tester'));

    const result = await TestBed.runInInjectionContext(() =>
      requireWorkspacePermission('lead')(route, state),
    );

    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/status/forbidden?returnUrl=%2Facme%2Fcheckout%2Freleases%2Fnew',
    );
  });
});
