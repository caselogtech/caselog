import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { ProjectSettingsLayout } from '../../../components/project-settings-layout/project-settings-layout';
import { ProjectSettingsApi } from '../../../data-access/project-settings-api';

@Component({ template: '' })
class EmptySettingsPage {}

describe('ProjectSettingsLayout', () => {
  const settingsApi = { get: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    settingsApi.get.mockReset().mockImplementation((_workspaceSlug: string, projectSlug: string) =>
      Promise.resolve({
        project: {
          id: '11111111-1111-4111-8111-111111111111',
          key: 'SHOP',
          slug: projectSlug,
          name: projectSlug === 'checkout' ? 'Storefront checkout' : 'Mobile application',
          state: 'active',
          caseCount: 0,
          activeRunCount: 0,
          createdAt: '2026-08-01T08:00:00.000Z',
          updatedAt: '2026-08-29T08:00:00.000Z',
        },
      }),
    );
    await TestBed.configureTestingModule({
      imports: [i18nTestingModule()],
      providers: [
        provideTanStackQuery(queryClient),
        { provide: ProjectSettingsApi, useValue: settingsApi },
        provideRouter([
          {
            path: ':org/:project/settings',
            component: ProjectSettingsLayout,
            children: [{ path: 'general', component: EmptySettingsPage }],
          },
        ]),
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders canonical project settings hierarchy and updates reused links', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/acme/checkout/settings/general');
    const layout = harness.routeNativeElement as HTMLElement;
    await vi.waitFor(() => expect(settingsApi.get).toHaveBeenCalledWith('acme', 'checkout'));

    const breadcrumbs = layout.querySelector('nav[aria-label="Breadcrumbs"]');
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(breadcrumbs?.textContent).toContain('Storefront checkout');
    });
    expect(breadcrumbs?.querySelector('[aria-current="page"]')?.textContent).toContain(
      'Project settings',
    );
    expect(layout.querySelectorAll('.settings-navigation a')).toHaveLength(2);
    expect(layout.querySelector('.settings-navigation a')?.getAttribute('href')).toBe(
      '/acme/checkout/settings/general',
    );

    await TestBed.inject(Router).navigateByUrl('/acme/mobile-app/settings/general');
    await vi.waitFor(() => expect(settingsApi.get).toHaveBeenCalledWith('acme', 'mobile-app'));

    await vi.waitFor(() => {
      harness.detectChanges();
      expect(breadcrumbs?.textContent).toContain('Mobile application');
    });
    expect(layout.querySelector('.settings-navigation a')?.getAttribute('href')).toBe(
      '/acme/mobile-app/settings/general',
    );
  });
});
