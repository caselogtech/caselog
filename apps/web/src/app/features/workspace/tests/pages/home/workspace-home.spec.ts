import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { OrganizationTokenResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceApi } from '../../../data-access/workspace-api';
import { WorkspaceHome } from '../../../pages/home/workspace-home';

const organizationSession: OrganizationTokenResponse = {
  accessToken: 'organization-access-token',
  expiresAt: '2099-08-02T12:00:00.000Z',
  organization: {
    id: 'c684c153-3802-49c7-94d1-a443262a9129',
    name: 'Acme Quality',
    slug: 'acme-quality',
  },
  role: 'owner',
};

describe('WorkspaceHome', () => {
  const workspaceApi = { open: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.open.mockReset();
    await TestBed.configureTestingModule({
      imports: [WorkspaceHome, i18nTestingModule()],
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

  it('opens the organization session for the workspace route', async () => {
    workspaceApi.open.mockResolvedValue(organizationSession);
    const fixture = TestBed.createComponent(WorkspaceHome);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.workspace.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(workspaceApi.open).toHaveBeenCalledWith('acme-quality');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Acme Quality');
  });
});
