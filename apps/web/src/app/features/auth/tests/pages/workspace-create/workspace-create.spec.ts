import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { CreateWorkspaceResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { AuthApi } from '../../../data-access/auth-api';
import { InstanceCapabilities } from '../../../../../core/instance/instance-capabilities';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { instanceCapabilitiesTestingValue } from '../../../../../../testing/instance-capabilities-testing';
import {
  slugifyWorkspaceName,
  WorkspaceCreate,
} from '../../../pages/workspace-create/workspace-create';

const createdWorkspace: CreateWorkspaceResponse = {
  workspace: {
    id: 'c684c153-3802-49c7-94d1-a443262a9129',
    membershipId: '12ed55ae-14d3-48d8-aa14-8f97c93c5327',
    name: 'Якість Плюс',
    slug: 'yakist-plyus',
    role: 'owner',
    deletedAt: null,
    recoverableUntil: null,
  },
  demoProject: {
    id: '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
    key: 'DEMO',
    name: 'Demo Project',
    slug: 'demo',
  },
};

describe('WorkspaceCreate', () => {
  const authApi = {
    createWorkspace: vi.fn(),
    workspaceSlugAvailability: vi.fn(),
  };
  let queryClient: QueryClient;
  let capabilities: ReturnType<typeof instanceCapabilitiesTestingValue>;

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    authApi.createWorkspace.mockReset();
    authApi.workspaceSlugAvailability.mockReset();
    capabilities = instanceCapabilitiesTestingValue();
    await TestBed.configureTestingModule({
      imports: [WorkspaceCreate, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: AuthApi, useValue: authApi },
        { provide: InstanceCapabilities, useValue: capabilities },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('creates readable URL slugs from Latin and Ukrainian names', () => {
    expect(slugifyWorkspaceName('Acme Quality Team')).toBe('acme-quality-team');
    expect(slugifyWorkspaceName('Якість Плюс')).toBe('yakist-plyus');
  });

  it('preserves a slug after the user edits it', () => {
    const fixture = TestBed.createComponent(WorkspaceCreate);
    fixture.componentInstance.form.controls.name.setValue('First Company');
    expect(fixture.componentInstance.form.controls.slug.value).toBe('first-company');

    fixture.componentInstance.markSlugAsEdited();
    fixture.componentInstance.form.controls.slug.setValue('custom-url');
    fixture.componentInstance.form.controls.name.setValue('Renamed Company');

    expect(fixture.componentInstance.form.controls.slug.value).toBe('custom-url');
  });

  it('creates an available workspace and enters it', async () => {
    authApi.workspaceSlugAvailability.mockResolvedValue({ available: true });
    authApi.createWorkspace.mockResolvedValue(createdWorkspace);
    const fixture = TestBed.createComponent(WorkspaceCreate);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    fixture.componentInstance.form.setValue({ name: 'Якість Плюс', slug: 'yakist-plyus' });

    await new Promise((resolve) => setTimeout(resolve, 400));
    await fixture.whenStable();
    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/', 'yakist-plyus']));

    expect(authApi.workspaceSlugAvailability).toHaveBeenCalledWith('yakist-plyus');
    expect(authApi.createWorkspace).toHaveBeenCalledWith({
      name: 'Якість Плюс',
      slug: 'yakist-plyus',
    });
  });

  it('does not prepare or submit workspace creation when the instance disables it', () => {
    capabilities.update({ workspaceCreationEnabled: false });
    const fixture = TestBed.createComponent(WorkspaceCreate);
    fixture.detectChanges();
    fixture.componentInstance.submit();

    expect(fixture.nativeElement.querySelector('.state-panel')?.textContent).toContain(
      'Workspace creation is disabled',
    );
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(authApi.workspaceSlugAvailability).not.toHaveBeenCalled();
    expect(authApi.createWorkspace).not.toHaveBeenCalled();
  });
});
