import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withRouterConfig } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BrowserSession } from '../../../../../core/auth/browser-session';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceShell } from '../../../components/workspace-shell/workspace-shell';

@Component({ template: '' })
class EmptyPage {}

describe('WorkspaceShell', () => {
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
                { path: ':project/cases', component: EmptyPage },
                { path: 'projects', component: EmptyPage },
              ],
            },
          ],
          withRouterConfig({ paramsInheritanceStrategy: 'always' }),
        ),
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
    expect(shell.querySelector('.primary-navigation')?.textContent).toContain('Test cases');
    expect(shell.querySelector('.primary-navigation')?.textContent).toContain('Releases');
    expect(shell.querySelector('.primary-navigation')?.textContent).toContain('Test runs');
    expect(shell.querySelector('.avatar')?.textContent?.trim()).toBe('DO');
  });
});
