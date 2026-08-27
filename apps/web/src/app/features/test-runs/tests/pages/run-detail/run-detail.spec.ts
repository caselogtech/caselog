import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { RunProgressResponse, TestRunDetailResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { BrowserSession } from '../../../../../core/auth/browser-session';
import { TestRunsApi } from '../../../data-access/test-runs-api';
import { RunDraftStore, type RunDraftContext } from '../../../state/run-draft-store';
import { RunDetail } from '../../../pages/run-detail/run-detail';

const RUN_ID = 'b101eace-107c-4177-8d7c-f4f052785c16';
const ITEM_ID = 'f230fe74-dd2d-40db-a0a4-21a8597526ef';
const PASSED_ID = 'f03a1a64-f159-4f39-86ca-c21b135d6815';
const USER_ID = '882c64fe-a728-40a0-91a9-96c74f585895';
const draftContext: RunDraftContext = {
  userId: USER_ID,
  workspaceSlug: 'acme',
  projectSlug: 'authentication',
  runId: RUN_ID,
  itemId: ITEM_ID,
};
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

const progress: RunProgressResponse = {
  project: detail.project,
  run: detail.run,
  progressPercent: 0,
  passRate: null,
  successfulCount: 0,
  incompleteCount: 1,
  statuses: [
    {
      status: detail.items[0]?.status as NonNullable<(typeof detail.items)[number]['status']>,
      count: 1,
      percentage: 100,
    },
  ],
  assignees: [{ assignee: null, itemCount: 1, completedCount: 0, failedCount: 0 }],
  suites: [
    {
      suite: { id: '3ba44470-2ee9-4edb-b684-e23f4e6f491c', name: 'Authentication' },
      itemCount: 1,
      completedCount: 0,
      failedCount: 0,
    },
  ],
};

describe('RunDetail', () => {
  const workspaceApi = {
    testRun: vi.fn(),
    runProgress: vi.fn(),
    startTestRun: vi.fn(),
    closeTestRun: vi.fn(),
    assignTestRunItem: vi.fn(),
    recordTestResult: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    localStorage.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.testRun.mockReset().mockResolvedValue(detail);
    workspaceApi.runProgress.mockReset().mockResolvedValue(progress);
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
        attachments: [],
      },
    });
    await TestBed.configureTestingModule({
      imports: [RunDetail, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: TestRunsApi, useValue: workspaceApi },
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
    TestBed.inject(BrowserSession).user.set({
      id: USER_ID,
      email: 'ada@example.com',
      displayName: 'Ada',
      emailVerified: true,
    });
  });

  afterEach(() => {
    localStorage.clear();
    queryClient.clear();
    vi.useRealTimers();
  });

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

  it('renders the aggregated progress report', async () => {
    const fixture = TestBed.createComponent(RunDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.progress.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(workspaceApi.runProgress).toHaveBeenCalledWith('acme', 'authentication', RUN_ID);
    expect(fixture.nativeElement.textContent).toContain('Execution progress');
    expect(fixture.nativeElement.textContent).toContain('Authentication');
  });

  it('opens a selected case from the execution queue', async () => {
    const firstItem = detail.items[0];
    if (!firstItem) throw new Error('Expected the test fixture to contain a run item');
    const secondItem = {
      ...firstItem,
      id: 'e49b0d11-5dc0-4afd-bec4-c3ac2991cafd',
      position: 1,
      caseVersion: {
        ...firstItem.caseVersion,
        id: 'd96878f9-c353-4521-89fe-a22a811cfaaa',
        title: 'Reset password',
      },
    };
    workspaceApi.testRun.mockResolvedValueOnce({
      ...detail,
      run: { ...detail.run, itemCount: 2 },
      items: [firstItem, secondItem],
    });
    const fixture = TestBed.createComponent(RunDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));
    fixture.detectChanges();

    const queueButtons = fixture.nativeElement.querySelectorAll('.queue-items button');
    queueButtons[1]?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedItem()?.id).toBe(secondItem.id);
    expect(fixture.nativeElement.querySelector('.execution-panel h2').textContent).toContain(
      'Reset password',
    );
  });

  it('restores and clears an item-scoped execution draft after submission', async () => {
    const draftStore = TestBed.inject(RunDraftStore);
    draftStore.save(draftContext, {
      comment: 'Connection interrupted',
      elapsedSeconds: 17,
      stepStatuses: { 0: PASSED_ID },
    });
    const fixture = TestBed.createComponent(RunDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));
    fixture.detectChanges();

    await vi.waitFor(() =>
      expect(fixture.componentInstance.resultForm.getRawValue()).toEqual({
        comment: 'Connection interrupted',
        elapsedSeconds: 17,
      }),
    );
    expect(fixture.componentInstance.isStepStatusSelected(0, PASSED_ID)).toBe(true);
    expect(fixture.componentInstance.draftRestored()).toBe(true);

    fixture.componentInstance.record(PASSED_ID);
    await vi.waitFor(() => expect(draftStore.load(draftContext)).toBeNull());
    expect(fixture.componentInstance.resultForm.getRawValue()).toEqual({
      comment: '',
      elapsedSeconds: 0,
    });
  });

  it('tracks elapsed time and keeps the draft when execution goes offline', async () => {
    const fixture = TestBed.createComponent(RunDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));
    fixture.detectChanges();

    vi.useFakeTimers();
    fixture.componentInstance.startTimer();
    vi.advanceTimersByTime(2_000);
    expect(fixture.componentInstance.resultForm.controls.elapsedSeconds.value).toBe(2);
    fixture.componentInstance.pauseTimer();
    vi.advanceTimersByTime(1_000);
    expect(fixture.componentInstance.resultForm.controls.elapsedSeconds.value).toBe(2);

    fixture.componentInstance.handleOffline();
    expect(fixture.componentInstance.online()).toBe(false);
    expect(TestBed.inject(RunDraftStore).load(draftContext)).toMatchObject({
      elapsedSeconds: 2,
    });
    fixture.componentInstance.resetTimer();
    expect(fixture.componentInstance.resultForm.controls.elapsedSeconds.value).toBe(0);
  });
});
