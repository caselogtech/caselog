import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import type { ResultIngestionListResponse, TestRunListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { TestRunsApi } from '../../../../test-runs/public-api';
import { CiImportsApi } from '../../../data-access/ci-imports-api';
import { CiImports } from '../../../pages/ci-imports/ci-imports';

const project = {
  id: 'c684c153-3802-49c7-94d1-a443262a9129',
  key: 'AUTH',
  slug: 'authentication',
  name: 'Authentication Project',
};
const history: ResultIngestionListResponse = {
  project,
  summary: { reportsThisWeek: 38, matchedPercentThisWeek: 94, unmatchedThisWeek: 23 },
  items: [
    {
      id: '6fe23247-f3b8-44ec-99fb-f7567940c580',
      run: {
        id: 'b101eace-107c-4177-8d7c-f4f052785c16',
        name: 'Checkout regression',
        build: '2026.08.23',
      },
      format: 'junit',
      status: 'completed',
      source: 'GitHub Actions',
      pipeline: 'checkout-regression',
      branch: 'main',
      total: 142,
      recorded: 139,
      unmatched: 3,
      truncated: 0,
      counts: { passed: 130, failed: 9, error: 0, skipped: 3 },
      error: null,
      initiatedBy: null,
      createdAt: '2026-08-23T12:00:00.000Z',
      completedAt: '2026-08-23T12:00:02.000Z',
    },
  ],
  nextCursor: null,
};
const activeRuns: TestRunListResponse = {
  project,
  items: [
    {
      id: 'b101eace-107c-4177-8d7c-f4f052785c16',
      name: 'Checkout regression',
      status: 'active',
      build: '2026.08.23',
      itemCount: 142,
      completedCount: 0,
      failedCount: 0,
      createdAt: '2026-08-23T11:00:00.000Z',
      closedAt: null,
    },
  ],
  nextCursor: null,
};

describe('CiImports', () => {
  const workspaceApi = {
    listResultIngestions: vi.fn(),
    listTestRuns: vi.fn(),
    uploadJUnitResults: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.listResultIngestions.mockReset().mockResolvedValue(history);
    workspaceApi.listTestRuns.mockReset().mockResolvedValue(activeRuns);
    workspaceApi.uploadJUnitResults.mockReset().mockResolvedValue({
      total: 1,
      recorded: 1,
      truncated: 0,
      counts: { passed: 1, failed: 0, error: 0, skipped: 0 },
      unmatched: [],
    });
    await TestBed.configureTestingModule({
      imports: [CiImports, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: TestRunsApi, useValue: workspaceApi },
        { provide: CiImportsApi, useValue: workspaceApi },
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

  it('renders summary, ingestion history, and URL-backed status filtering', async () => {
    const fixture = TestBed.createComponent(CiImports);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.imports.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('38');
    expect(fixture.nativeElement.textContent).toContain('94%');
    expect(fixture.nativeElement.textContent).toContain('GitHub Actions');
    expect(fixture.nativeElement.textContent).toContain('3 unmatched');

    await fixture.componentInstance.selectStatus('failed');
    await vi.waitFor(() =>
      expect(workspaceApi.listResultIngestions).toHaveBeenLastCalledWith(
        'acme',
        'authentication',
        undefined,
        'failed',
      ),
    );
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { status: 'failed' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('validates the selected report and uploads it to the active run', async () => {
    const fixture = TestBed.createComponent(CiImports);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.activeRuns.isSuccess()).toBe(true));

    fixture.componentInstance.selectFile(
      new File(['not xml'], 'results.txt', { type: 'text/plain' }),
    );
    expect(fixture.componentInstance.fileError()).toBe('type');

    const report = new File(['<testsuite/>'], 'results.xml', { type: 'application/xml' });
    fixture.componentInstance.pipelineControl.setValue('checkout-regression');
    fixture.componentInstance.branchControl.setValue('main');
    fixture.componentInstance.selectFile(report);
    fixture.componentInstance.uploadReport();

    await vi.waitFor(() => expect(fixture.componentInstance.upload.isSuccess()).toBe(true));
    expect(workspaceApi.uploadJUnitResults).toHaveBeenCalledWith(
      'acme',
      'authentication',
      'b101eace-107c-4177-8d7c-f4f052785c16',
      report,
      { pipeline: 'checkout-regression', branch: 'main' },
    );
    expect(fixture.componentInstance.lastUpload()).toMatchObject({ recorded: 1 });
  });
});
