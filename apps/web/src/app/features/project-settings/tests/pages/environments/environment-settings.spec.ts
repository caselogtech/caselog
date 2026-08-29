import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, type ParamMap } from '@angular/router';
import type { EnvironmentSummary } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { ProjectEnvironmentsApi } from '../../../data-access/project-environments-api';
import { EnvironmentSettings } from '../../../pages/environments/environment-settings';

const production: EnvironmentSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Production',
  slug: 'production',
  description: 'Customer-facing production',
  state: 'active',
  createdAt: '2026-08-20T12:00:00.000Z',
  updatedAt: '2026-08-20T12:00:00.000Z',
};

describe('EnvironmentSettings', () => {
  const environmentsApi = {
    list: vi.fn(),
    create: vi.fn(),
    changeState: vi.fn(),
  };
  let queryClient: QueryClient;
  let routeParams: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    routeParams = new BehaviorSubject(convertToParamMap({ org: 'acme', project: 'checkout' }));
    environmentsApi.list.mockReset().mockResolvedValue({ items: [production] });
    environmentsApi.create.mockReset().mockResolvedValue({ environment: production });
    environmentsApi.changeState.mockReset().mockResolvedValue({
      environmentId: production.id,
      state: 'archived',
    });
    await TestBed.configureTestingModule({
      imports: [EnvironmentSettings, i18nTestingModule()],
      providers: [
        provideTanStackQuery(queryClient),
        { provide: ProjectEnvironmentsApi, useValue: environmentsApi },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: routeParams,
            snapshot: { paramMap: routeParams.value },
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(WorkspaceSession).role.set('lead');
  });

  afterEach(() => queryClient.clear());

  it('renders project environments and permission-aware actions', async () => {
    const fixture = TestBed.createComponent(EnvironmentSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.environments.isSuccess()).toBe(true));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Environments');
    expect(text).toContain('Production');
    expect(text).toContain('Archive');
  });

  it('creates an environment with an idempotency key', async () => {
    const fixture = TestBed.createComponent(EnvironmentSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.environments.isSuccess()).toBe(true));
    const request = {
      name: 'Staging',
      slug: 'staging',
      description: undefined,
    };

    fixture.componentInstance.showCreate.set(true);
    fixture.componentInstance.create(request);
    await vi.waitFor(() => expect(environmentsApi.create).toHaveBeenCalledOnce());

    expect(environmentsApi.create).toHaveBeenCalledWith(
      'acme',
      'checkout',
      request,
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    await vi.waitFor(() => expect(fixture.componentInstance.showCreate()).toBe(false));
  });

  it('requires confirmation before archiving an environment', async () => {
    const fixture = TestBed.createComponent(EnvironmentSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.environments.isSuccess()).toBe(true));
    const request = { action: 'archive' as const, environment: production };

    fixture.componentInstance.requestStateChange(request);
    expect(fixture.componentInstance.confirmation()).toEqual(request);
    expect(environmentsApi.changeState).not.toHaveBeenCalled();
    fixture.componentInstance.confirmStateChange();
    await vi.waitFor(() => expect(environmentsApi.changeState).toHaveBeenCalledOnce());

    expect(environmentsApi.changeState).toHaveBeenCalledWith(
      'acme',
      'checkout',
      production.id,
      'archive',
    );
  });

  it('re-scopes environment queries when Angular reuses the route', async () => {
    const fixture = TestBed.createComponent(EnvironmentSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(environmentsApi.list).toHaveBeenCalledWith('acme', 'checkout'));

    routeParams.next(convertToParamMap({ org: 'acme', project: 'mobile-app' }));

    await vi.waitFor(() => expect(environmentsApi.list).toHaveBeenCalledWith('acme', 'mobile-app'));
  });
});
