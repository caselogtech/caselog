import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSettingsApi } from '../../../data-access/workspace-settings-api';
import { WorkspaceDangerSettings } from '../../../pages/danger/workspace-danger-settings';

const currentWorkspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Acme QA',
  slug: 'acme',
  deletedAt: null,
  recoverableUntil: null,
};

describe('WorkspaceDangerSettings', () => {
  const settingsApi = {
    get: vi.fn(),
    delete: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    settingsApi.get.mockReset().mockResolvedValue({ workspace: currentWorkspace });
    settingsApi.delete.mockReset().mockResolvedValue({
      workspace: {
        ...currentWorkspace,
        deletedAt: '2026-08-27T22:00:00.000Z',
        recoverableUntil: '2026-09-26T22:00:00.000Z',
      },
    });
    await TestBed.configureTestingModule({
      imports: [WorkspaceDangerSettings, i18nTestingModule()],
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

  it('requires the exact name before deleting and leaving workspace context', async () => {
    const fixture = TestBed.createComponent(WorkspaceDangerSettings);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.settings.isSuccess()).toBe(true));

    fixture.componentInstance.form.controls.confirmation.setValue('acme qa');
    fixture.componentInstance.submit();
    expect(settingsApi.delete).not.toHaveBeenCalled();

    fixture.componentInstance.form.controls.confirmation.setValue('Acme QA');
    fixture.componentInstance.submit();
    await vi.waitFor(() =>
      expect(settingsApi.delete).toHaveBeenCalledWith('acme', {
        confirmation: 'Acme QA',
      }),
    );
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(['/auth/workspaces'], { replaceUrl: true }),
    );
    expect(TestBed.inject(WorkspaceSession).current()).toBeNull();
  });

  it('does not render deletion controls for a workspace admin', async () => {
    TestBed.inject(WorkspaceSession).role.set('admin');
    const fixture = TestBed.createComponent(WorkspaceDangerSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.settings.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Owner permission required');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
});
