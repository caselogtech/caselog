import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withRouterConfig } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { ProjectListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../testing/i18n-testing';
import { instanceCapabilitiesTestingValue } from '../../../../../testing/instance-capabilities-testing';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { InstanceCapabilities } from '../../../../core/instance/instance-capabilities';
import { AuthApi } from '../../../auth/public-api';
import { WorkspaceApi } from '../../data-access/workspace-api';
import { workspaceRoutes } from '../../workspace.routes';

const projects: ProjectListResponse = {
  items: [
    {
      id: '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
      key: 'WEB',
      slug: 'web',
      name: 'Web Project',
      state: 'active',
      caseCount: 12,
      activeRunCount: 2,
      createdAt: '2026-08-02T12:00:00.000Z',
      updatedAt: '2026-08-02T12:00:00.000Z',
    },
  ],
  nextCursor: null,
};

describe('Workspace entry routes', () => {
  const workspaceApi = { listProjects: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.listProjects.mockReset().mockResolvedValue(projects);
    await TestBed.configureTestingModule({
      imports: [i18nTestingModule()],
      providers: [
        provideRouter(workspaceRoutes, withRouterConfig({ paramsInheritanceStrategy: 'always' })),
        provideTanStackQuery(queryClient),
        { provide: WorkspaceApi, useValue: workspaceApi },
        {
          provide: AuthApi,
          useValue: { listWorkspaces: vi.fn().mockResolvedValue({ workspaces: [] }) },
        },
        { provide: InstanceCapabilities, useValue: instanceCapabilitiesTestingValue() },
      ],
    }).compileComponents();
    TestBed.inject(WorkspaceSession).role.set('owner');
  });

  afterEach(() => queryClient.clear());

  it.each(['/acme', '/acme/projects'])(
    'opens available projects from %s with the Projects navigation active',
    async (url) => {
      const harness = await RouterTestingHarness.create(url);
      await vi.waitFor(() => {
        harness.detectChanges();
        expect(harness.routeNativeElement?.querySelector('.project-card')?.textContent).toContain(
          'Web Project',
        );
      });

      expect(TestBed.inject(Router).url).toBe('/acme/projects');
      expect(workspaceApi.listProjects).toHaveBeenCalledWith('acme', undefined);
      expect(harness.routeNativeElement?.querySelector('main h1')?.textContent).toBe('Projects');
      expect(
        harness.routeNativeElement
          ?.querySelector('.workspace-navigation a[aria-current="page"]')
          ?.textContent?.trim(),
      ).toBe('Projects');
      expect(harness.routeNativeElement?.textContent).not.toContain('Getting started');
    },
  );

  it('shows the empty project list and creation action when a workspace has no projects', async () => {
    workspaceApi.listProjects.mockResolvedValue({ items: [], nextCursor: null });
    const harness = await RouterTestingHarness.create('/empty-workspace');

    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement?.querySelector('main')?.textContent).toContain(
        'No active projects',
      );
    });

    expect(TestBed.inject(Router).url).toBe('/empty-workspace/projects');
    expect(workspaceApi.listProjects).toHaveBeenCalledWith('empty-workspace', undefined);
    expect(harness.routeNativeElement?.querySelector('main')?.textContent).toContain(
      'Create project',
    );
  });
});
