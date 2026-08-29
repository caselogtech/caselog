import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  type ParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import type { ProjectSummary } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { ProjectSettingsApi } from '../../../data-access/project-settings-api';
import { ProjectGeneralSettings } from '../../../pages/general/project-general-settings';

const currentProject: ProjectSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  key: 'SHOP',
  slug: 'checkout',
  name: 'Checkout',
  state: 'active',
  caseCount: 12,
  activeRunCount: 2,
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-08-29T08:00:00.000Z',
};

describe('ProjectGeneralSettings', () => {
  const settingsApi = {
    get: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  };
  let queryClient: QueryClient;
  let routeParams: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() {
        this.removeAttribute('open');
      },
    });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    routeParams = new BehaviorSubject(convertToParamMap({ org: 'acme', project: 'checkout' }));
    settingsApi.get.mockReset().mockResolvedValue({ project: currentProject });
    settingsApi.update.mockReset().mockResolvedValue({
      project: { ...currentProject, name: 'Storefront checkout' },
    });
    settingsApi.archive.mockReset().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [ProjectGeneralSettings, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: ProjectSettingsApi, useValue: settingsApi },
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

  it('updates the display name while rendering key and slug as immutable identity', async () => {
    const fixture = TestBed.createComponent(ProjectGeneralSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.settings.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.componentInstance.form.getRawValue()).toEqual({ name: 'Checkout' });
    const element = fixture.nativeElement as HTMLElement;
    const readonlyValues = Array.from(
      element.querySelectorAll<HTMLInputElement>('input[readonly]'),
      (input) => input.value,
    );
    expect(readonlyValues).toEqual(['SHOP', 'checkout']);

    fixture.componentInstance.form.controls.name.setValue(' Storefront checkout ');
    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(settingsApi.update).toHaveBeenCalledOnce());

    expect(settingsApi.update).toHaveBeenCalledWith('acme', 'checkout', {
      name: 'Storefront checkout',
    });
    await vi.waitFor(() => expect(fixture.componentInstance.saved()).toBe(true));
  });

  it('archives only after confirmation and returns to the project list', async () => {
    const fixture = TestBed.createComponent(ProjectGeneralSettings);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.settings.isSuccess()).toBe(true));

    fixture.componentInstance.requestArchive();
    expect(settingsApi.archive).not.toHaveBeenCalled();
    fixture.componentInstance.confirmArchive();
    await vi.waitFor(() => expect(settingsApi.archive).toHaveBeenCalledWith('acme', 'checkout'));
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(['/', 'acme', 'projects'], { replaceUrl: true }),
    );
  });

  it('re-scopes project queries when Angular reuses the route', async () => {
    const fixture = TestBed.createComponent(ProjectGeneralSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(settingsApi.get).toHaveBeenCalledWith('acme', 'checkout'));

    routeParams.next(convertToParamMap({ org: 'acme', project: 'mobile-app' }));

    await vi.waitFor(() => expect(settingsApi.get).toHaveBeenCalledWith('acme', 'mobile-app'));
  });

  it('renders project settings without mutation controls for testers', async () => {
    TestBed.inject(WorkspaceSession).role.set('tester');
    const fixture = TestBed.createComponent(ProjectGeneralSettings);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.settings.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Project identity is read only');
    expect(fixture.nativeElement.querySelector('button[type="submit"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.lifecycle-card')).toBeNull();
  });
});
