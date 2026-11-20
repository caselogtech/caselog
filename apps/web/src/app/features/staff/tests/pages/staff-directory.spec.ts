import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../testing/i18n-testing';
import { StaffApi } from '../../data-access/staff-api';
import { StaffDirectory } from '../../pages/directory/staff-directory';
import { workspaceDetail } from '../support/staff-workspace.fixture';

describe('StaffDirectory workspace customers', () => {
  const api = { workspaces: vi.fn() };
  let queryClient: QueryClient;
  beforeEach(async () => {
    api.workspaces.mockReset().mockResolvedValue({
      workspaces: [workspaceDetail.workspace],
      nextCursor: '33333333-3333-4333-8333-333333333333',
    });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await TestBed.configureTestingModule({
      imports: [StaffDirectory, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: StaffApi, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { resource: 'workspaces' } } } },
      ],
    }).compileComponents();
  });
  afterEach(() => queryClient.clear());

  it('links to staff details and shows the owner without linking into customer content', async () => {
    const fixture = TestBed.createComponent(StaffDirectory);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('owner@example.com');
    });
    const element: HTMLElement = fixture.nativeElement;
    expect(
      element.querySelector(`a[href="/staff/workspaces/${workspaceDetail.workspace.id}"]`),
    ).not.toBeNull();
    expect(element.querySelector('a[href="/example-customer"]')).toBeNull();
  });

  it('resets pagination when applying an owner-email search or lifecycle filter', async () => {
    const fixture = TestBed.createComponent(StaffDirectory);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.directory.isSuccess()).toBe(true));
    fixture.componentInstance.nextPage();
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(api.workspaces).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: '33333333-3333-4333-8333-333333333333' }),
      ),
    );
    fixture.componentInstance.searchDraft.set(' owner@example.com ');
    fixture.componentInstance.applySearch();
    fixture.componentInstance.changeWorkspaceState('deleted');
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(api.workspaces).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 25,
        q: 'owner@example.com',
        state: 'deleted',
      }),
    );
    expect(fixture.componentInstance.cursorHistory()).toEqual([]);
  });
  it('preserves invalid search input without requesting another page', async () => {
    const fixture = TestBed.createComponent(StaffDirectory);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.directory.isSuccess()).toBe(true));
    const requests = api.workspaces.mock.calls.length;
    fixture.componentInstance.searchDraft.set('x');
    fixture.componentInstance.applySearch();
    fixture.detectChanges();
    expect(fixture.componentInstance.searchDraft()).toBe('x');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      '2 and 100',
    );
    expect(api.workspaces).toHaveBeenCalledTimes(requests);
  });
});
