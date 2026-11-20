import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { i18nTestingModule } from '../../../../../testing/i18n-testing';
import { StaffApi } from '../../data-access/staff-api';
import { StaffUserDetail } from '../../pages/user-detail/staff-user-detail';
import { StaffSession } from '../../state/staff-session';
import { userDetail } from '../support/staff-user.fixture';

describe('StaffUserDetail', () => {
  const api = { userDetail: vi.fn() };
  let queryClient: QueryClient;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(async () => {
    api.userDetail.mockReset().mockResolvedValue(userDetail);
    params = new BehaviorSubject(convertToParamMap({ userId: userDetail.user.id }));
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await TestBed.configureTestingModule({
      imports: [StaffUserDetail, i18nTestingModule()],
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

  it('renders identity, verification, roles and links only to staff workspace metadata', async () => {
    const fixture = TestBed.createComponent(StaffUserDetail);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Customer owner');
    });
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('a[href="mailto:owner@example.com"]')).not.toBeNull();
    expect(
      element.querySelector(`a[href="/staff/workspaces/${userDetail.workspaces[0]?.id}"]`),
    ).not.toBeNull();
    expect(element.querySelector('a[href="/example-customer"]')).toBeNull();
    expect(element.textContent).toContain('Verified');
    expect(element.textContent).toContain('Owner');
    const tableRegion = element.querySelector<HTMLElement>('.table-frame');
    tableRegion?.focus();
    expect(document.activeElement).toBe(tableRegion);
    await fixture.componentInstance.detail.refetch();
    expect(api.userDetail).toHaveBeenCalledTimes(2);
  });

  it('announces pending data without flashing an empty membership list', () => {
    api.userDetail.mockReturnValue(new Promise(() => {}));
    const fixture = TestBed.createComponent(StaffUserDetail);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reading user identity');
    expect(fixture.nativeElement.textContent).not.toContain('no current workspace memberships');
  });

  it('shows deleted identity and empty memberships explicitly', async () => {
    api.userDetail.mockResolvedValue({
      ...userDetail,
      user: { ...userDetail.user, deletedAt: '2026-11-20T12:00:00.000Z', emailVerified: false },
      workspaces: [],
      nextCursor: null,
    });
    const fixture = TestBed.createComponent(StaffUserDetail);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('no current workspace memberships');
    });
    expect(fixture.nativeElement.textContent).toContain('Deleted on');
    expect(fixture.nativeElement.textContent).toContain('Unverified');
  });

  it('labels retained memberships in deleted workspaces', async () => {
    api.userDetail.mockResolvedValue({
      ...userDetail,
      workspaces: userDetail.workspaces.map((workspace) => ({
        ...workspace,
        role: 'read_only',
        deletedAt: '2026-11-20T12:00:00.000Z',
      })),
    });
    const fixture = TestBed.createComponent(StaffUserDetail);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Deleted');
    });
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Read only');
  });

  it.each([
    { status: 404, code: 'not_found', message: 'This user no longer exists' },
    { status: 403, code: 'insufficient_permissions', message: 'permission' },
    { status: 500, code: 'internal_error', message: 'unexpected error' },
    { status: 0, code: 'network_error', message: 'Check your connection' },
  ])('renders the $status failure locally', async ({ status, code, message }) => {
    api.userDetail.mockRejectedValue(
      new HttpErrorResponse({
        status,
        error: { error: { code, message: 'Failure', details: {}, requestId: 'req-test' } },
      }),
    );
    const fixture = TestBed.createComponent(StaffUserDetail);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent.toLowerCase()).toContain(message.toLowerCase());
    });
    expect(fixture.nativeElement.textContent).not.toContain('owner@example.com');
  });

  it('navigates membership pages and resets pagination for a different user', async () => {
    const fixture = TestBed.createComponent(StaffUserDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));
    fixture.componentInstance.nextPage();
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(api.userDetail).toHaveBeenCalledWith(userDetail.user.id, {
        cursor: userDetail.nextCursor,
        limit: 25,
      }),
    );
    fixture.componentInstance.previousPage();
    fixture.detectChanges();
    expect(fixture.componentInstance.pagination().cursor).toBeUndefined();
    fixture.componentInstance.nextPage();
    fixture.detectChanges();
    const otherId = '55555555-5555-4555-8555-555555555555';
    params.next(convertToParamMap({ userId: otherId }));
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(api.userDetail).toHaveBeenCalledWith(otherId, { cursor: undefined, limit: 25 }),
    );
    expect(fixture.componentInstance.pagination().history).toEqual([]);
  });

  it('does not reuse identity data across staff operator changes', async () => {
    const fixture = TestBed.createComponent(StaffUserDetail);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('owner@example.com');
    });
    api.userDetail.mockReturnValue(new Promise(() => {}));
    TestBed.inject(StaffSession).operator.set({
      userId: '55555555-5555-4555-8555-555555555555',
      displayName: 'Operator',
      email: 'operator@example.com',
      role: 'support',
      accessExpiresAt: '2026-11-21T10:00:00.000Z',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('owner@example.com');
  });
});
