import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { WorkspaceListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { AuthApi } from '../auth-api';
import { i18nTestingModule } from '../../../../testing/i18n-testing';
import { WorkspaceList } from './workspace-list';

const workspaceResponse: WorkspaceListResponse = {
  workspaces: [
    {
      id: 'c684c153-3802-49c7-94d1-a443262a9129',
      membershipId: '12ed55ae-14d3-48d8-aa14-8f97c93c5327',
      name: 'Acme Quality',
      slug: 'acme-quality',
      role: 'owner',
    },
  ],
};

describe('WorkspaceList', () => {
  const authApi = { listWorkspaces: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    authApi.listWorkspaces.mockReset();
    await TestBed.configureTestingModule({
      imports: [WorkspaceList, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: AuthApi, useValue: authApi },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('shows an actionable empty state', async () => {
    authApi.listWorkspaces.mockResolvedValue({ workspaces: [] });
    const fixture = TestBed.createComponent(WorkspaceList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.workspaces.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.empty-state')?.textContent).toContain(
      'Create your first workspace',
    );
    expect(fixture.nativeElement.querySelector('.empty-state a')?.getAttribute('href')).toBe(
      '/auth/workspace',
    );
  });

  it('shows workspace identity and membership role', async () => {
    authApi.listWorkspaces.mockResolvedValue(workspaceResponse);
    const fixture = TestBed.createComponent(WorkspaceList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.workspaces.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.workspace-card')?.textContent).toContain(
      'Acme Quality',
    );
    expect(fixture.nativeElement.querySelector('.workspace-card')?.textContent).toContain('Owner');
  });
});
