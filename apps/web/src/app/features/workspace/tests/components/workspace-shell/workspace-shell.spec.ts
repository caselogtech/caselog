import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withRouterConfig } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BrowserSession } from '../../../../../core/auth/browser-session';
import { InstanceCapabilities } from '../../../../../core/instance/instance-capabilities';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { instanceCapabilitiesTestingValue } from '../../../../../../testing/instance-capabilities-testing';
import { WorkspaceShell } from '../../../components/workspace-shell/workspace-shell';

@Component({ template: '' })
class EmptyPage {}

describe('WorkspaceShell', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [i18nTestingModule()],
      providers: [
        provideRouter(
          [
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
});
