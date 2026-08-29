import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type { ProjectListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { of } from 'rxjs';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { WorkspaceApi } from '../../../data-access/workspace-api';
import { ProjectList } from '../../../pages/projects/project-list';

const firstPage: ProjectListResponse = {
  items: [
    {
      id: '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
      key: 'DEMO',
      slug: 'demo',
      name: 'Demo Project',
      state: 'active',
      caseCount: 12,
      activeRunCount: 2,
      createdAt: '2026-08-02T12:00:00.000Z',
      updatedAt: '2026-08-02T12:00:00.000Z',
    },
  ],
  nextCursor: '77bcbeb6-1c8d-49ac-8358-e2c80ab0e188',
};

describe('ProjectList', () => {
  const workspaceApi = { listProjects: vi.fn(), createProject: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.listProjects.mockReset();
    workspaceApi.createProject.mockReset();
    const paramMap = convertToParamMap({ org: 'acme-quality' });
    await TestBed.configureTestingModule({
      imports: [ProjectList, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: WorkspaceApi, useValue: workspaceApi },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(paramMap), snapshot: { paramMap } },
        },
      ],
    }).compileComponents();
    TestBed.inject(WorkspaceSession).role.set('owner');
  });

  afterEach(() => queryClient.clear());

  it('renders tenant project metrics from the API', async () => {
    workspaceApi.listProjects.mockResolvedValue({ ...firstPage, nextCursor: null });
    const fixture = TestBed.createComponent(ProjectList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.projects.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(workspaceApi.listProjects).toHaveBeenCalledWith('acme-quality', undefined);
    const breadcrumbs = fixture.nativeElement.querySelector('nav[aria-label="Breadcrumbs"]');
    expect(breadcrumbs?.textContent).toContain('Acme Quality');
    expect(breadcrumbs?.querySelector('[aria-current="page"]')?.textContent).toContain('Projects');
    expect(fixture.nativeElement.querySelector('.project-card')?.textContent).toContain(
      'Demo Project',
    );
    expect(fixture.nativeElement.querySelector('.project-card')?.textContent).toContain('12');
    expect(fixture.nativeElement.querySelector('.project-card')?.textContent).toContain('2');
  });

  it('shows the project empty state', async () => {
    workspaceApi.listProjects.mockResolvedValue({ items: [], nextCursor: null });
    const fixture = TestBed.createComponent(ProjectList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.projects.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.projects-state')?.textContent).toContain(
      'No active projects',
    );
  });

  it('shows a retryable localized error state', async () => {
    workspaceApi.listProjects.mockRejectedValue(new Error('network unavailable'));
    const fixture = TestBed.createComponent(ProjectList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.projects.isError()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Something went wrong',
    );
    expect(fixture.nativeElement.querySelector('[role="alert"] button')).not.toBeNull();
  });

  it('loads the next cursor page without replacing existing projects', async () => {
    workspaceApi.listProjects.mockResolvedValueOnce(firstPage).mockResolvedValueOnce({
      items: [
        {
          ...firstPage.items[0],
          id: '77bcbeb6-1c8d-49ac-8358-e2c80ab0e189',
          key: 'WEB',
          slug: 'web',
          name: 'Web Project',
        },
      ],
      nextCursor: null,
    });
    const fixture = TestBed.createComponent(ProjectList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.projects.hasNextPage()).toBe(true));

    await fixture.componentInstance.projects.fetchNextPage();
    await vi.waitFor(() => expect(fixture.componentInstance.items()).toHaveLength(2));
    fixture.detectChanges();

    expect(workspaceApi.listProjects).toHaveBeenLastCalledWith(
      'acme-quality',
      firstPage.nextCursor,
    );
    expect(fixture.nativeElement.querySelectorAll('.project-card')).toHaveLength(2);
  });

  it('creates a project and opens its test cases', async () => {
    workspaceApi.listProjects.mockResolvedValue({ ...firstPage, nextCursor: null });
    workspaceApi.createProject.mockResolvedValue({
      project: { ...firstPage.items[0], key: 'WEB', slug: 'web', name: 'Web Project' },
    });
    const fixture = TestBed.createComponent(ProjectList);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.projects.isSuccess()).toBe(true));

    fixture.componentInstance.openCreateForm();
    fixture.componentInstance.submitProject({ name: 'Web Project', key: 'WEB', slug: 'web' });
    await vi.waitFor(() => expect(workspaceApi.createProject).toHaveBeenCalled());
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());

    expect(workspaceApi.createProject).toHaveBeenCalledWith('acme-quality', {
      name: 'Web Project',
      key: 'WEB',
      slug: 'web',
    });
    expect(navigate).toHaveBeenCalledWith(['/', 'acme-quality', 'web', 'cases']);
  });

  it('hides project creation from members below lead role', async () => {
    TestBed.inject(WorkspaceSession).role.set('tester');
    workspaceApi.listProjects.mockResolvedValue({ ...firstPage, nextCursor: null });
    const fixture = TestBed.createComponent(ProjectList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.projects.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-project-create-form')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Create project');
  });
});
