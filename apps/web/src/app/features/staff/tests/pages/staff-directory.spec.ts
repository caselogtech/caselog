import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../testing/i18n-testing';
import { StaffApi } from '../../data-access/staff-api';
import { StaffDirectory } from '../../pages/directory/staff-directory';
import { StaffWorkspaceDetail } from '../../pages/workspace-detail/staff-workspace-detail';
import { workspaceDetail } from '../support/staff-workspace.fixture';

describe('StaffDirectory URL navigation', () => {
  const api = { workspaces: vi.fn(), workspaceDetail: vi.fn() };
  let queryClient: QueryClient;
  beforeEach(async () => {
    api.workspaces.mockReset().mockResolvedValue({
      workspaces: [workspaceDetail.workspace],
      nextCursor: '33333333-3333-4333-8333-333333333333',
    });
    api.workspaceDetail.mockReset().mockResolvedValue(workspaceDetail);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await TestBed.configureTestingModule({
      imports: [i18nTestingModule()],
      providers: [
        provideRouter([
          { path: 'staff/workspaces', component: StaffDirectory, data: { resource: 'workspaces' } },
          { path: 'staff/workspaces/:workspaceId', component: StaffWorkspaceDetail },
        ]),
        provideTanStackQuery(queryClient),
        { provide: StaffApi, useValue: api },
      ],
    }).compileComponents();
  });
  afterEach(() => queryClient.clear());

  it('reads filters/cursor from a shared URL and links to staff metadata with the return context', async () => {
    const cursor = '33333333-3333-4333-8333-333333333333';
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      `/staff/workspaces?q=owner%40example.com&state=current&limit=1&cursor=${cursor}`,
      StaffDirectory,
    );
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(harness.routeNativeElement?.textContent).toContain('owner@example.com');
    });
    expect(page.searchDraft()).toBe('owner@example.com');
    expect(api.workspaces).toHaveBeenCalledWith({
      limit: 1,
      q: 'owner@example.com',
      state: 'current',
      cursor,
    });
    const link = harness.routeNativeElement?.querySelector(
      `a[href^="/staff/workspaces/${workspaceDetail.workspace.id}?"]`,
    );
    expect(link?.getAttribute('href')).toContain('returnTo=');
    expect(harness.routeNativeElement?.querySelector('a[href="/example-customer"]')).toBeNull();
  });

  it('updates URLs and resets pagination after applying search and lifecycle filters', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/staff/workspaces', StaffDirectory);
    await vi.waitFor(() => expect(page.directory.isSuccess()).toBe(true));
    await page.nextPage();
    harness.detectChanges();
    await vi.waitFor(() => expect(page.cursor()).toBe('33333333-3333-4333-8333-333333333333'));
    expect(page.previousUrl()).toBe('/staff/workspaces');
    await page.previousPage();
    expect(TestBed.inject(Router).url).toBe('/staff/workspaces');
    page.searchDraft.set(' owner@example.com ');
    await page.applySearch();
    await page.changeWorkspaceState('deleted');
    harness.detectChanges();
    await vi.waitFor(() =>
      expect(api.workspaces).toHaveBeenCalledWith({
        limit: 25,
        q: 'owner@example.com',
        state: 'deleted',
      }),
    );
    expect(page.previousUrl()).toBeUndefined();
    expect(TestBed.inject(Router).url).toBe('/staff/workspaces?q=owner@example.com&state=deleted');
  });

  it('restores directory state after navigating through a card and supports a fresh deep link', async () => {
    const harness = await RouterTestingHarness.create();
    const url =
      '/staff/workspaces?q=owner&state=current&cursor=33333333-3333-4333-8333-333333333333';
    await harness.navigateByUrl(url, StaffDirectory);
    const card = await harness.navigateByUrl(
      `/staff/workspaces/${workspaceDetail.workspace.id}?returnTo=${encodeURIComponent(url)}`,
      StaffWorkspaceDetail,
    );
    expect(card.directoryReturn.href()).toBe(url);
    const page = await harness.navigateByUrl(card.directoryReturn.href(), StaffDirectory);
    expect(page.searchDraft()).toBe('owner');
    expect(page.workspaceState()).toBe('current');
    expect(page.cursor()).toBe('33333333-3333-4333-8333-333333333333');
    await page.firstPage();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/staff/workspaces?q=owner&state=current');
  });

  it('preserves invalid search input without requesting another page', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/staff/workspaces', StaffDirectory);
    await vi.waitFor(() => expect(page.directory.isSuccess()).toBe(true));
    const requests = api.workspaces.mock.calls.length;
    page.searchDraft.set('x');
    await page.applySearch();
    harness.detectChanges();
    expect(page.searchDraft()).toBe('x');
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain(
      '2 and 100',
    );
    expect(api.workspaces).toHaveBeenCalledTimes(requests);
  });

  it('does not request data for malformed links and offers a reset', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/staff/workspaces?cursor=invalid', StaffDirectory);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Invalid directory filters');
    expect(api.workspaces).not.toHaveBeenCalled();
    await page.resetFilters();
    harness.detectChanges();
    await vi.waitFor(() => expect(api.workspaces).toHaveBeenCalled());
    expect(TestBed.inject(Router).url).toBe('/staff/workspaces');
  });
});
