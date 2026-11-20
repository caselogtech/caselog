import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../testing/i18n-testing';
import { StaffApi } from '../../data-access/staff-api';
import { StaffAudit } from '../../pages/audit/staff-audit';
import { StaffSession } from '../../state/staff-session';
import { auditResponse } from '../support/staff-audit.fixture';

describe('StaffAudit filters', () => {
  const api = { auditLogs: vi.fn() };
  let queryClient: QueryClient;
  beforeEach(async () => {
    api.auditLogs.mockReset().mockResolvedValue(auditResponse);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await TestBed.configureTestingModule({
      imports: [i18nTestingModule()],
      providers: [
        provideRouter([{ path: 'staff/audit', component: StaffAudit }]),
        provideTanStackQuery(queryClient),
        { provide: StaffApi, useValue: api },
      ],
    }).compileComponents();
  });
  afterEach(() => queryClient.clear());

  it('reads shared filters from the URL and renders event times in UTC', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      '/staff/audit?q=owner&action=staff.operator.granted&targetType=staff_operator&targetId=target&from=2026-11-20T00:00:00.000Z&to=2026-11-21T00:00:00.000Z',
      StaffAudit,
    );
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement?.textContent).toContain('Grant support access');
    });
    expect(api.auditLogs).toHaveBeenCalledWith({
      limit: 25,
      q: 'owner',
      action: 'staff.operator.granted',
      targetType: 'staff_operator',
      targetId: 'target',
      from: '2026-11-20T00:00:00.000Z',
      to: '2026-11-21T00:00:00.000Z',
    });
    expect(page.draft().from).toBe('2026-11-20T00:00:00.000');
    expect(harness.routeNativeElement?.querySelector('time')?.textContent).toContain('UTC');
  });

  it('preserves filter values on every page and resets the cursor when applying filters', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/staff/audit?q=owner&limit=1', StaffAudit);
    await vi.waitFor(() => expect(page.audit.isSuccess()).toBe(true));
    await page.nextPage();
    harness.detectChanges();
    await vi.waitFor(() =>
      expect(api.auditLogs).toHaveBeenCalledWith({
        q: 'owner',
        limit: 1,
        cursor: auditResponse.nextCursor,
      }),
    );
    await page.previousPage();
    expect(TestBed.inject(Router).url).toBe('/staff/audit?q=owner&limit=1');
    page.updateFilter('action', 'staff.operator.revoked');
    await page.applyFilters();
    harness.detectChanges();
    await vi.waitFor(() =>
      expect(api.auditLogs).toHaveBeenCalledWith({
        q: 'owner',
        action: 'staff.operator.revoked',
        limit: 1,
      }),
    );
    expect(page.previousUrl()).toBeUndefined();
    await page.clearFilters();
    expect(TestBed.inject(Router).url).toBe('/staff/audit');
  });

  it('keeps invalid input and current results without requesting invalid ranges', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/staff/audit', StaffAudit);
    await vi.waitFor(() => expect(page.audit.isSuccess()).toBe(true));
    const requests = api.auditLogs.mock.calls.length;
    page.updateFilter('from', '2026-11-21T00:00:00');
    page.updateFilter('to', '2026-11-20T00:00:00');
    await page.applyFilters();
    harness.detectChanges();
    expect(page.draft().from).toBe('2026-11-21T00:00:00');
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain(
      'Until later than From',
    );
    expect(api.auditLogs).toHaveBeenCalledTimes(requests);
    expect(TestBed.inject(Router).url).toBe('/staff/audit');
  });

  it('blocks malformed shared filters until reset', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/staff/audit?from=invalid', StaffAudit);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Invalid audit filters');
    expect(api.auditLogs).not.toHaveBeenCalled();
    await page.clearFilters();
    harness.detectChanges();
    await vi.waitFor(() => expect(api.auditLogs).toHaveBeenCalledWith({ limit: 25 }));
  });

  it('announces loading before presenting an empty result', async () => {
    api.auditLogs.mockReturnValue(new Promise(() => {}));
    const harness = await RouterTestingHarness.create('/staff/audit');
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Reading staff audit events');
    expect(harness.routeNativeElement?.textContent).not.toContain('No staff audit events');
  });

  it('shows empty filtered results', async () => {
    api.auditLogs.mockResolvedValue({ auditLogs: [], nextCursor: null });
    const harness = await RouterTestingHarness.create('/staff/audit');
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement?.textContent).toContain('No staff audit events match');
    });
  });

  it.each([
    { status: 403, code: 'insufficient_permissions', message: 'permission' },
    { status: 500, code: 'internal_error', message: 'unexpected error' },
    { status: 0, code: 'network_error', message: 'check your connection' },
  ])('renders the $status error locally', async ({ status, code, message }) => {
    api.auditLogs.mockRejectedValue(
      new HttpErrorResponse({
        status,
        error: { error: { code, message: 'Failure', details: {}, requestId: 'test' } },
      }),
    );
    const harness = await RouterTestingHarness.create('/staff/audit');
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement?.textContent.toLowerCase()).toContain(message);
    });
  });

  it('does not reuse audit data across operator changes', async () => {
    const harness = await RouterTestingHarness.create('/staff/audit');
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement?.textContent).toContain('owner@example.com');
    });
    api.auditLogs.mockReturnValue(new Promise(() => {}));
    TestBed.inject(StaffSession).operator.set({
      userId: '44444444-4444-4444-8444-444444444444',
      displayName: 'Operator',
      email: 'operator@example.com',
      role: 'admin',
      accessExpiresAt: '2026-11-21T00:00:00.000Z',
    });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).not.toContain('owner@example.com');
  });
});
