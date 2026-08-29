import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { WorkspaceSettingsLayout } from '../../../components/workspace-settings-layout/workspace-settings-layout';

@Component({ template: '' })
class EmptySettingsPage {}

describe('WorkspaceSettingsLayout', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [i18nTestingModule()],
      providers: [
        provideRouter([
          {
            path: ':org/settings',
            component: WorkspaceSettingsLayout,
            children: [{ path: 'general', component: EmptySettingsPage }],
          },
        ]),
      ],
    }).compileComponents();

    TestBed.inject(WorkspaceSession).start({
      accessToken: 'workspace-token',
      expiresAt: '2099-08-27T22:00:00.000Z',
      organization: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Acme Quality',
        slug: 'acme',
      },
      role: 'owner',
    });
  });

  it('renders the settings hierarchy and updates links when the route is reused', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/acme/settings/general');
    const layout = harness.routeNativeElement as HTMLElement;

    const breadcrumbs = layout.querySelector('nav[aria-label="Breadcrumbs"]');
    expect(breadcrumbs?.textContent).toContain('Acme Quality');
    expect(breadcrumbs?.querySelector('[aria-current="page"]')?.textContent).toContain(
      'Workspace settings',
    );
    expect(layout.querySelector('.settings-navigation a')?.getAttribute('href')).toBe(
      '/acme/settings/general',
    );

    await TestBed.inject(Router).navigateByUrl('/mobile-guild/settings/general');
    harness.detectChanges();

    expect(breadcrumbs?.textContent).toContain('Mobile Guild');
    expect(layout.querySelector('.settings-navigation a')?.getAttribute('href')).toBe(
      '/mobile-guild/settings/general',
    );
  });
});
