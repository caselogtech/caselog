import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { i18nTestingModule } from '../../../../../testing/i18n-testing';
import { StaffApi } from '../../data-access/staff-api';
import { StaffSession } from '../../state/staff-session';
import { StaffWorkspaceDetail } from '../../pages/workspace-detail/staff-workspace-detail';
import { workspaceDetail } from '../support/staff-workspace.fixture';

describe('StaffWorkspaceDetail', () => {
  const api = { workspaceDetail: vi.fn() };
  let queryClient: QueryClient;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(async () => {
    api.workspaceDetail.mockReset().mockResolvedValue(workspaceDetail);
    params = new BehaviorSubject(convertToParamMap({ workspaceId: workspaceDetail.workspace.id }));
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await TestBed.configureTestingModule({
      imports: [StaffWorkspaceDetail, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: StaffApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: params.value }, paramMap: params },
        },
      ],
    }).compileComponents();
  });
  afterEach(() => queryClient.clear());

  it('shows the owner contact and resource snapshot and refreshes through the API', async () => {
    const fixture = TestBed.createComponent(StaffWorkspaceDetail);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Example customer');
    });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('a[href="mailto:owner@example.com"]')?.textContent).toContain(
      'owner@example.com',
    );
    expect(element.textContent).toContain('Current test cases');
    expect(element.textContent).toContain('Snapshot from');
    expect(element.textContent).toContain('1 KB');
    await fixture.componentInstance.detail.refetch();
    expect(api.workspaceDetail).toHaveBeenCalledTimes(2);
  });

  it('announces loading without presenting empty usage or a missing owner', () => {
    api.workspaceDetail.mockReturnValue(new Promise(() => {}));
    const fixture = TestBed.createComponent(StaffWorkspaceDetail);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reading workspace contacts');
    expect(fixture.nativeElement.textContent).not.toContain('No current owner contact');
  });

  it('represents deleted workspaces and missing owner/billing data', async () => {
    api.workspaceDetail.mockResolvedValue({
      ...workspaceDetail,
      workspace: {
        ...workspaceDetail.workspace,
        deletedAt: '2026-11-20T09:00:00.000Z',
        owner: null,
      },
    });
    const fixture = TestBed.createComponent(StaffWorkspaceDetail);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No current owner contact');
    });
    expect(fixture.nativeElement.textContent).toContain('Deleted on');
    expect(fixture.nativeElement.textContent).toContain('No billing account');
  });

  it.each([
    { status: 404, code: 'not_found', message: 'This workspace no longer exists' },
    { status: 403, code: 'insufficient_permissions', message: 'permission' },
    { status: 500, code: 'internal_error', message: 'unexpected error' },
    { status: 0, code: 'network_error', message: 'Check your connection' },
  ])('renders the $status failure without a usage snapshot', async ({ status, code, message }) => {
    api.workspaceDetail.mockRejectedValue(
      new HttpErrorResponse({
        status,
        error: { error: { code, message: 'Failure', details: {}, requestId: 'req-test' } },
      }),
    );
    const fixture = TestBed.createComponent(StaffWorkspaceDetail);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent.toLowerCase()).toContain(message.toLowerCase());
    });
    expect(fixture.nativeElement.textContent).not.toContain('Snapshot from');
  });

  it('fetches the new workspace when the route parameter changes', async () => {
    const fixture = TestBed.createComponent(StaffWorkspaceDetail);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(api.workspaceDetail).toHaveBeenCalledWith(workspaceDetail.workspace.id),
    );
    const next = '33333333-3333-4333-8333-333333333333';
    params.next(convertToParamMap({ workspaceId: next }));
    fixture.detectChanges();
    await vi.waitFor(() => expect(api.workspaceDetail).toHaveBeenCalledWith(next));
  });
  it('does not display cached customer contacts when the staff identity changes', async () => {
    const fixture = TestBed.createComponent(StaffWorkspaceDetail);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('owner@example.com');
    });
    api.workspaceDetail.mockReturnValue(new Promise(() => {}));
    TestBed.inject(StaffSession).operator.set({
      userId: '44444444-4444-4444-8444-444444444444',
      email: 'another@example.com',
      displayName: 'Another operator',
      role: 'admin',
      accessExpiresAt: '2026-11-21T10:00:00.000Z',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reading workspace contacts');
    expect(fixture.nativeElement.textContent).not.toContain('owner@example.com');
  });
});
