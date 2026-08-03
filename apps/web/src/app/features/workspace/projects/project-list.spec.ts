import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { ProjectListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../testing/i18n-testing';
import { WorkspaceApi } from '../workspace-api';
import { ProjectList } from './project-list';

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
  const workspaceApi = { listProjects: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.listProjects.mockReset();
    await TestBed.configureTestingModule({
      imports: [ProjectList, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: WorkspaceApi, useValue: workspaceApi },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ org: 'acme-quality' }) } },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders tenant project metrics from the API', async () => {
    workspaceApi.listProjects.mockResolvedValue({ ...firstPage, nextCursor: null });
    const fixture = TestBed.createComponent(ProjectList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.projects.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(workspaceApi.listProjects).toHaveBeenCalledWith('acme-quality', undefined);
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
});
