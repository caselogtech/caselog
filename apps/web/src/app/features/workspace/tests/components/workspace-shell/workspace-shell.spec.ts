import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withRouterConfig } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { instanceCapabilitiesTestingValue } from '../../../../../../testing/instance-capabilities-testing';
import { BrowserSession } from '../../../../../core/auth/browser-session';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { InstanceCapabilities } from '../../../../../core/instance/instance-capabilities';
import { AuthApi } from '../../../../auth/public-api';
import { WorkspaceShell } from '../../../components/workspace-shell/workspace-shell';
import { WorkspaceApi } from '../../../data-access/workspace-api';

@Component({ template: '' })
class EmptyPage {}

describe('WorkspaceShell', () => {
  const authApi = {
    listWorkspaces: vi.fn(),
    logout: vi.fn<() => Promise<void>>(),
  };
  const workspaceApi = { listProjects: vi.fn() };
  let queryClient: QueryClient;

  afterEach(() => {
    document.body.style.overflow = '';
    queryClient.clear();
  });

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    authApi.listWorkspaces.mockReset().mockResolvedValue({ workspaces: [] });
    authApi.logout.mockReset().mockResolvedValue(undefined);
    workspaceApi.listProjects.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    await TestBed.configureTestingModule({
      imports: [i18nTestingModule()],
      providers: [
        provideRouter(
          [
            { path: 'auth/login', component: EmptyPage },
            {
              path: ':org',
              component: WorkspaceShell,
              children: [
                { path: ':project/releases', component: EmptyPage },
                { path: ':project/release-policies', component: EmptyPage },
                { path: ':project/evidence', component: EmptyPage },
                { path: ':project/cases', component: EmptyPage },
                { path: 'settings/general', component: EmptyPage },
                { path: 'projects', component: EmptyPage },
              ],
            },
          ],
          withRouterConfig({ paramsInheritanceStrategy: 'always' }),
        ),
        provideTanStackQuery(queryClient),
        { provide: AuthApi, useValue: authApi },
        { provide: WorkspaceApi, useValue: workspaceApi },
        { provide: InstanceCapabilities, useValue: instanceCapabilitiesTestingValue() },
      ],
    }).compileComponents();
  });

  it('shows project navigation and the signed-in user context', async () => {
    TestBed.inject(BrowserSession).user.set({
      id: '2d17f8de-43a9-4a86-9ccf-65deabed9882',
      email: 'demo@caselog.local',
      displayName: 'Demo Owner',
      emailVerified: true,
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/acme/checkout/cases');

    const shell = harness.routeNativeElement as HTMLElement;
    expect(shell.querySelector('.brand')?.textContent?.trim()).toBe('Caselog');
    expect(shell.querySelector('app-brand-mark svg')).not.toBeNull();
    expect(
      Array.from(shell.querySelectorAll('.project-navigation a')).map((link) =>
        link.textContent?.trim(),
      ),
    ).toEqual([
      'Releases',
      'Test runs',
      'Release policies',
      'Evidence',
      'Test cases',
      'CI imports',
      'Project settings',
    ]);
    expect(
      shell.querySelector('.project-navigation a[aria-current="page"]')?.textContent?.trim(),
    ).toBe('Test cases');
    expect(shell.querySelector('.context-switchers')?.textContent).toContain('Checkout');
    expect(shell.querySelector('.avatar')?.textContent?.trim()).toBe('DO');
    expect(shell.querySelector('.workspace-navigation')?.textContent).toContain(
      'Workspace settings',
    );
    expect(shell.querySelector('.instance-context')?.textContent).toContain('Test Caselog');
  });

  it('treats workspace settings as workspace context instead of a project slug', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/acme/settings/general');

    const shell = harness.routeNativeElement as HTMLElement;
    expect(shell.querySelector('.project-navigation')).toBeNull();
    expect(
      shell.querySelector('.workspace-navigation a[aria-current="page"]')?.textContent?.trim(),
    ).toBe('Workspace settings');
  });

  it('updates shell links when Angular reuses it for another workspace', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/acme/checkout/cases');
    const shell = harness.routeNativeElement as HTMLElement;

    await TestBed.inject(Router).navigateByUrl('/mobile-guild/projects');
    harness.detectChanges();

    expect(shell.querySelector('.brand')?.getAttribute('href')).toBe('/mobile-guild/projects');
    await vi.waitFor(() =>
      expect(workspaceApi.listProjects).toHaveBeenCalledWith('mobile-guild', undefined),
    );
  });

  it('opens and dismisses the responsive navigation with Escape', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/acme/checkout/cases');

    const shell = harness.routeNativeElement as HTMLElement;
    const toggle = shell.querySelector<HTMLButtonElement>('.navigation-toggle');
    toggle?.click();
    harness.detectChanges();

    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(shell.querySelector('.product-navigation')?.classList).toContain('open');
    expect(document.body.style.overflow).toBe('hidden');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    harness.detectChanges();

    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.style.overflow).toBe('');
  });

  it('closes the account menu with Escape and outside clicks', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/acme/checkout/cases');

    const shell = harness.routeNativeElement as HTMLElement;
    const menu = shell.querySelector<HTMLDetailsElement>('.account-context details');
    const summary = shell.querySelector<HTMLElement>('.account-context summary');
    const signOut = shell.querySelector<HTMLButtonElement>('.sign-out');
    if (!menu) throw new Error('Account menu was not rendered');

    menu.open = true;
    signOut?.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(summary);

    menu.open = true;
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.open).toBe(false);
  });

  it('revokes the server session, clears local context, and returns to login', async () => {
    const browserSession = TestBed.inject(BrowserSession);
    browserSession.start({
      accessToken: 'browser-token',
      expiresAt: '2026-08-28T23:00:00.000Z',
      user: {
        id: '2d17f8de-43a9-4a86-9ccf-65deabed9882',
        email: 'demo@caselog.local',
        displayName: 'Demo Owner',
        emailVerified: true,
      },
    });
    const workspaceSession = TestBed.inject(WorkspaceSession);
    workspaceSession.start({
      accessToken: 'workspace-token',
      expiresAt: '2026-08-28T23:00:00.000Z',
      role: 'owner',
      organization: {
        id: '8e736d8f-f141-49c6-a42b-dca615d2a274',
        name: 'Acme QA',
        slug: 'acme',
      },
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/acme/checkout/cases');

    const signOut = harness.routeNativeElement?.querySelector<HTMLButtonElement>('.sign-out');
    signOut?.click();

    await vi.waitFor(() => expect(authApi.logout).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/auth/login'));
    expect(browserSession.accessToken()).toBeNull();
    expect(workspaceSession.current()).toBeNull();
  });

  it('keeps the account context and announces a failed sign-out', async () => {
    authApi.logout.mockRejectedValueOnce(new Error('offline'));
    const browserSession = TestBed.inject(BrowserSession);
    browserSession.user.set({
      id: '2d17f8de-43a9-4a86-9ccf-65deabed9882',
      email: 'demo@caselog.local',
      displayName: 'Demo Owner',
      emailVerified: true,
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/acme/checkout/cases');

    const shell = harness.routeNativeElement as HTMLElement;
    shell.querySelector<HTMLButtonElement>('.sign-out')?.click();

    await vi.waitFor(() => {
      expect(shell.querySelector('.account-error')?.textContent).toContain(
        'Something went wrong. Please try again.',
      );
    });
    expect(browserSession.user()?.email).toBe('demo@caselog.local');
    expect(TestBed.inject(Router).url).toBe('/acme/checkout/cases');
  });
});
