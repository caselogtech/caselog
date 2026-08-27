import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSettingsApi } from '../../../data-access/workspace-settings-api';
import { WorkspaceGeneralSettings } from '../../../pages/general/workspace-general-settings';

const currentWorkspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Acme QA',
  slug: 'acme',
  deletedAt: null,
  recoverableUntil: null,
};

describe('WorkspaceGeneralSettings', () => {
  const settingsApi = {
    get: vi.fn(),
    update: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    settingsApi.get.mockReset().mockResolvedValue({ workspace: currentWorkspace });
    settingsApi.update.mockReset().mockResolvedValue({
      workspace: { ...currentWorkspace, name: 'Acme Quality', slug: 'acme-quality' },
    });
    await TestBed.configureTestingModule({
      imports: [WorkspaceGeneralSettings, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: WorkspaceSettingsApi, useValue: settingsApi },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ org: 'acme' }) } },
        },
      ],
    }).compileComponents();
    TestBed.inject(WorkspaceSession).start({
      accessToken: 'workspace-token',
      expiresAt: '2099-08-27T22:00:00.000Z',
      organization: { id: currentWorkspace.id, name: currentWorkspace.name, slug: 'acme' },
      role: 'owner',
    });
  });

  afterEach(() => queryClient.clear());

  it('loads and saves identity before navigating to a changed canonical slug', async () => {
    const fixture = TestBed.createComponent(WorkspaceGeneralSettings);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.settings.isSuccess()).toBe(true));

    expect(fixture.componentInstance.form.getRawValue()).toEqual({
      name: 'Acme QA',
      slug: 'acme',
    });
    fixture.componentInstance.form.setValue({
      name: 'Acme Quality',
      slug: 'acme-quality',
    });
    fixture.componentInstance.submit();

    await vi.waitFor(() => expect(settingsApi.update).toHaveBeenCalledOnce());
    expect(settingsApi.update).toHaveBeenCalledWith('acme', {
      name: 'Acme Quality',
      slug: 'acme-quality',
    });
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(['/', 'acme-quality', 'settings', 'general'], {
        replaceUrl: true,
      }),
    );
    expect(TestBed.inject(WorkspaceSession).organization()).toMatchObject({
      name: 'Acme Quality',
      slug: 'acme-quality',
    });
  });

  it('renders read-only settings for roles without admin access', async () => {
    TestBed.inject(WorkspaceSession).role.set('tester');
    const fixture = TestBed.createComponent(WorkspaceGeneralSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.settings.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Workspace identity is read only');
    expect(fixture.nativeElement.querySelector('button[type="submit"]')).toBeNull();
  });
});
