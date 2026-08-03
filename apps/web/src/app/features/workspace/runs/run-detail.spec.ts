import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { TestRunDetailResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../testing/i18n-testing';
import { WorkspaceApi } from '../workspace-api';
import { RunDetail } from './run-detail';

const RUN_ID = 'b101eace-107c-4177-8d7c-f4f052785c16';
const ITEM_ID = 'f230fe74-dd2d-40db-a0a4-21a8597526ef';
const PASSED_ID = 'f03a1a64-f159-4f39-86ca-c21b135d6815';
const detail: TestRunDetailResponse = {
  project: {
    id: 'c684c153-3802-49c7-94d1-a443262a9129',
    key: 'AUTH',
    slug: 'authentication',
    name: 'Authentication Project',
  },
  run: {
    id: RUN_ID,
    name: 'Regression',
    status: 'active',
    build: 'rc1',
    itemCount: 1,
    completedCount: 0,
    failedCount: 0,
    createdAt: '2026-08-02T12:00:00.000Z',
    closedAt: null,
  },
  items: [
    {
      id: ITEM_ID,
      position: 0,
      caseVersion: {
        id: 'a102d849-b90c-4d1c-9a29-b8173ee70fa6',
        version: 2,
        title: 'Sign in',
        template: 'steps',
        preconditions: null,
        expectedResult: null,
        content: { steps: [{ action: 'Enter valid credentials', expected: 'Dashboard opens' }] },
      },
      status: {
        id: '2956551a-eea9-414f-8ad6-88819af091cf',
        key: 'untested',
        name: 'Untested',
        color: '#64748B',
        isFinal: false,
        countsAsFailure: false,
      },
      assignee: null,
      attemptCount: 0,
    },
  ],
  nextCursor: null,
  members: [],
  statuses: [
    {
      id: PASSED_ID,
      key: 'passed',
      name: 'Passed',
      color: '#16A34A',
      isFinal: true,
      countsAsFailure: false,
    },
  ],
};

describe('RunDetail', () => {
  const workspaceApi = {
    testRun: vi.fn(),
    startTestRun: vi.fn(),
    closeTestRun: vi.fn(),
    assignTestRunItem: vi.fn(),
    recordTestResult: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.testRun.mockReset().mockResolvedValue(detail);
    workspaceApi.recordTestResult.mockReset().mockResolvedValue({
      result: {
        id: '4c305be5-9ab8-4ef4-889c-08b666b5d402',
        attempt: 1,
        status: detail.statuses[0],
        comment: 'Works',
        elapsedMs: 2_000,
        executedBy: null,
        executedAt: '2026-08-02T12:01:00.000Z',
        stepResults: [],
      },
    });
    await TestBed.configureTestingModule({
      imports: [RunDetail, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: WorkspaceApi, useValue: workspaceApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                org: 'acme',
                project: 'authentication',
                runId: RUN_ID,
              }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders the immutable case snapshot and records a timed result', async () => {
    const fixture = TestBed.createComponent(RunDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Enter valid credentials');

    fixture.componentInstance.resultForm.setValue({ comment: ' Works ', elapsedSeconds: 2 });
    fixture.componentInstance.chooseStepStatus(0, PASSED_ID);
    fixture.componentInstance.record(PASSED_ID);
    await vi.waitFor(() => expect(workspaceApi.recordTestResult).toHaveBeenCalledOnce());
    expect(workspaceApi.recordTestResult).toHaveBeenCalledWith(
      'acme',
      'authentication',
      RUN_ID,
      ITEM_ID,
      {
        statusId: PASSED_ID,
        comment: 'Works',
        elapsedMs: 2_000,
        stepResults: [{ position: 0, statusId: PASSED_ID }],
      },
    );
  });
});
