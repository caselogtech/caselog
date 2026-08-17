import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import type { TestRunListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceApi } from '../../../data-access/workspace-api';
import { RunList } from '../../../pages/runs/run-list';

const response: TestRunListResponse = {
  project: {
    id: 'c684c153-3802-49c7-94d1-a443262a9129',
    key: 'AUTH',
    slug: 'authentication',
    name: 'Authentication Project',
  },
  items: [
    {
      id: 'b101eace-107c-4177-8d7c-f4f052785c16',
      name: 'Regression',
      status: 'active',
      build: 'rc1',
      itemCount: 10,
      completedCount: 4,
      failedCount: 1,
      createdAt: '2026-08-02T12:00:00.000Z',
      closedAt: null,
    },
  ],
  nextCursor: null,
};

describe('RunList', () => {
  const workspaceApi = { listTestRuns: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.listTestRuns.mockReset().mockResolvedValue(response);
    await TestBed.configureTestingModule({
      imports: [RunList, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: WorkspaceApi, useValue: workspaceApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ org: 'acme', project: 'authentication' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders run progress and persists the status filter', async () => {
    const fixture = TestBed.createComponent(RunList);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.runs.isSuccess()).toBe(true));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Regression');
    expect(fixture.nativeElement.textContent).toContain('4 of 10 completed');
    expect(fixture.nativeElement.querySelector('progress').value).toBe(4);
    expect(fixture.nativeElement.querySelector('.status-active').textContent).toContain('Active');

    await fixture.componentInstance.selectStatus('completed');
    await vi.waitFor(() =>
      expect(workspaceApi.listTestRuns).toHaveBeenLastCalledWith(
        'acme',
        'authentication',
        undefined,
        'completed',
      ),
    );
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { status: 'completed' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('calculates progress safely for empty and partially completed runs', () => {
    const fixture = TestBed.createComponent(RunList);
    const run = response.items[0];
    if (!run) throw new Error('Expected the test fixture to contain a run');
    expect(
      fixture.componentInstance.progressPercent({
        ...run,
        itemCount: 0,
        completedCount: 0,
      }),
    ).toBe(0);
    expect(fixture.componentInstance.progressPercent(run)).toBe(40);
  });
});
