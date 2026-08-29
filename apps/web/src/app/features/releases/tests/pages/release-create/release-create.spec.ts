import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { ReleasesApi } from '../../../data-access/releases-api';
import { ReleaseCreate } from '../../../pages/release-create/release-create';

describe('ReleaseCreate', () => {
  const releasesApi = {
    listEnvironments: vi.fn(),
    createRelease: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    releasesApi.listEnvironments.mockReset().mockResolvedValue({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Production',
          slug: 'production',
          description: null,
          state: 'active',
          createdAt: '2026-08-20T12:00:00.000Z',
          updatedAt: '2026-08-20T12:00:00.000Z',
        },
      ],
    });
    releasesApi.createRelease.mockReset().mockResolvedValue({
      release: {
        id: '22222222-2222-4222-8222-222222222222',
        key: '2026.08',
        name: 'August release',
        state: 'draft',
        environment: null,
        targetDate: null,
        externalReference: null,
        candidateCount: 0,
        createdAt: '2026-08-27T12:00:00.000Z',
        updatedAt: '2026-08-27T12:00:00.000Z',
        activatedAt: null,
        releasedAt: null,
        cancelledAt: null,
      },
    });
    await TestBed.configureTestingModule({
      imports: [ReleaseCreate, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: ReleasesApi, useValue: releasesApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ org: 'acme', project: 'authentication' }),
            },
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(WorkspaceSession).role.set('lead');
  });

  afterEach(() => queryClient.clear());

  it('creates a draft release with normalized form values and navigates to its detail', async () => {
    const fixture = TestBed.createComponent(ReleaseCreate);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.environments.isSuccess()).toBe(true));
    const breadcrumbs = fixture.nativeElement.querySelector('nav[aria-label="Breadcrumbs"]');
    expect(breadcrumbs?.textContent).toContain('Releases');
    expect(breadcrumbs?.textContent).toContain('Create release');
    fixture.componentInstance.form.setValue({
      key: ' 2026.08 ',
      name: ' August release ',
      environmentId: '11111111-1111-4111-8111-111111111111',
      targetDate: '2026-08-31',
      externalReference: ' QA-100 ',
    });
    expect(fixture.componentInstance.form.valid).toBe(true);
    expect(fixture.componentInstance.canManage()).toBe(true);

    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(releasesApi.createRelease).toHaveBeenCalledOnce());

    expect(releasesApi.createRelease).toHaveBeenCalledWith(
      'acme',
      'authentication',
      {
        key: '2026.08',
        name: 'August release',
        environmentId: '11111111-1111-4111-8111-111111111111',
        targetDate: '2026-08-31T12:00:00.000Z',
        externalReference: 'QA-100',
      },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(navigate).toHaveBeenCalledWith([
      '/',
      'acme',
      'authentication',
      'releases',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('blocks submission for invalid keys and insufficient roles', () => {
    const fixture = TestBed.createComponent(ReleaseCreate);
    fixture.detectChanges();
    fixture.componentInstance.form.patchValue({ key: 'invalid key', name: 'Release' });
    fixture.componentInstance.submit();
    expect(releasesApi.createRelease).not.toHaveBeenCalled();

    TestBed.inject(WorkspaceSession).role.set('tester');
    fixture.componentInstance.form.patchValue({ key: 'valid-key' });
    fixture.componentInstance.submit();
    expect(releasesApi.createRelease).not.toHaveBeenCalled();
  });
});
