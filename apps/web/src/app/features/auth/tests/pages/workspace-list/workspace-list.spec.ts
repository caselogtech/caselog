import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { WorkspaceListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { AuthApi } from '../../../data-access/auth-api';
import { InstanceCapabilities } from '../../../../../core/instance/instance-capabilities';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { instanceCapabilitiesTestingValue } from '../../../../../../testing/instance-capabilities-testing';
import { WorkspaceList } from '../../../pages/workspace-list/workspace-list';

const workspaceResponse: WorkspaceListResponse = {
  workspaces: [
    {
      id: 'c684c153-3802-49c7-94d1-a443262a9129',
      membershipId: '12ed55ae-14d3-48d8-aa14-8f97c93c5327',
      name: 'Acme Quality',
      slug: 'acme-quality',
      role: 'owner',
      deletedAt: null,
      recoverableUntil: null,
    },
  ],
};

describe('WorkspaceList', () => {
  const authApi = { listWorkspaces: vi.fn(), restoreWorkspace: vi.fn() };
  let queryClient: QueryClient;
  let capabilities: ReturnType<typeof instanceCapabilitiesTestingValue>;

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    authApi.listWorkspaces.mockReset();
    authApi.restoreWorkspace.mockReset();
    capabilities = instanceCapabilitiesTestingValue();
    await TestBed.configureTestingModule({
      imports: [WorkspaceList, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: AuthApi, useValue: authApi },
        { provide: InstanceCapabilities, useValue: capabilities },
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

  it('does not offer workspace creation when the instance disables it', async () => {
    capabilities.update({ workspaceCreationEnabled: false });
    authApi.listWorkspaces.mockResolvedValue({ workspaces: [] });
    const fixture = TestBed.createComponent(WorkspaceList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.workspaces.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.empty-state')?.textContent).toContain(
      'No workspace access',
    );
    expect(fixture.nativeElement.querySelector('.primary-link')).toBeNull();
  });

  it('restores a deleted workspace from its recovery window', async () => {
    const activeWorkspace = workspaceResponse.workspaces.at(0);
    if (!activeWorkspace) throw new Error('Expected the active workspace fixture');
    const deletedWorkspace = {
      ...activeWorkspace,
      deletedAt: '2026-08-27T22:00:00.000Z',
      recoverableUntil: '2026-09-26T22:00:00.000Z',
    };
    authApi.listWorkspaces.mockImplementation((status: 'active' | 'deleted') =>
      Promise.resolve({ workspaces: status === 'deleted' ? [deletedWorkspace] : [] }),
    );
    authApi.restoreWorkspace.mockResolvedValue({
      workspace: {
        id: deletedWorkspace.id,
        name: deletedWorkspace.name,
        slug: deletedWorkspace.slug,
        deletedAt: null,
        recoverableUntil: null,
      },
    });
    const fixture = TestBed.createComponent(WorkspaceList);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.componentInstance.deletedWorkspaces.isSuccess()).toBe(true),
    );
    fixture.detectChanges();

    const restore = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.workspace-card.deleted button',
    );
    expect(restore?.textContent).toContain('Restore workspace');
    restore?.click();

    await vi.waitFor(() =>
      expect(authApi.restoreWorkspace).toHaveBeenCalledWith(deletedWorkspace.id),
    );
  });
});
