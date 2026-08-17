import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { TestResultDetailResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceApi } from '../../../data-access/workspace-api';
import { ResultDetail } from '../../../pages/runs/result-detail';

const RUN_ID = 'b101eace-107c-4177-8d7c-f4f052785c16';
const ITEM_ID = 'f230fe74-dd2d-40db-a0a4-21a8597526ef';
const RESULT_ID = '4c305be5-9ab8-4ef4-889c-08b666b5d402';
const ATTACHMENT_ID = '6fe23247-f3b8-44ec-99fb-f7567940c580';
const PASSED_STATUS = {
  id: 'f03a1a64-f159-4f39-86ca-c21b135d6815',
  key: 'passed',
  name: 'Passed',
  color: '#16A34A',
  isFinal: true,
  countsAsFailure: false,
};
const response: TestResultDetailResponse = {
  item: {
    id: ITEM_ID,
    position: 0,
    caseVersion: {
      id: 'a102d849-b90c-4d1c-9a29-b8173ee70fa6',
      version: 2,
      title: 'Sign in',
      template: 'steps',
      preconditions: null,
      expectedResult: null,
      content: { steps: [{ action: 'Enter credentials', expected: 'Dashboard opens' }] },
    },
    status: PASSED_STATUS,
    assignee: null,
    attemptCount: 2,
  },
  result: {
    id: RESULT_ID,
    attempt: 2,
    status: PASSED_STATUS,
    comment: 'Retest passed',
    elapsedMs: 2_000,
    executedBy: { id: '882c64fe-a728-40a0-91a9-96c74f585895', displayName: 'Ada' },
    executedAt: '2026-08-02T12:01:00.000Z',
    stepResults: [
      {
        id: '8cb63328-2452-4ce5-838d-a590e6765c86',
        position: 0,
        status: PASSED_STATUS,
        comment: 'Step passed',
        elapsedMs: 1_000,
      },
    ],
    attachments: [
      {
        id: ATTACHMENT_ID,
        fileName: 'failed-login.png',
        contentType: 'image/png',
        sizeBytes: 2_048,
        checksumSha256: 'a'.repeat(64),
        stepPosition: 0,
      },
    ],
  },
};

describe('ResultDetail', () => {
  const workspaceApi = {
    testResult: vi.fn(),
    testResultAttachmentDownload: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.testResult.mockReset().mockResolvedValue(response);
    workspaceApi.testResultAttachmentDownload.mockReset().mockResolvedValue({
      download: {
        url: 'https://storage.example.com/failed-login.png',
        expiresAt: '2026-08-02T12:35:00.000Z',
      },
    });
    await TestBed.configureTestingModule({
      imports: [ResultDetail, i18nTestingModule()],
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
                itemId: ITEM_ID,
                resultId: RESULT_ID,
              }),
            },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('renders the frozen case and recorded step outcome', async () => {
    const fixture = TestBed.createComponent(ResultDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(workspaceApi.testResult).toHaveBeenCalledWith(
      'acme',
      'authentication',
      RUN_ID,
      ITEM_ID,
      RESULT_ID,
    );
    expect(fixture.nativeElement.textContent).toContain('Enter credentials');
    expect(fixture.nativeElement.textContent).toContain('Step passed');
    expect(fixture.nativeElement.textContent).toContain('Retest passed');
    expect(fixture.nativeElement.textContent).toContain('failed-login.png');
    expect(fixture.nativeElement.textContent).toContain('Step 1');
  });

  it('opens a secure download for recorded evidence', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const fixture = TestBed.createComponent(ResultDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));

    fixture.componentInstance.downloadAttachment.mutate(ATTACHMENT_ID);

    await vi.waitFor(() =>
      expect(workspaceApi.testResultAttachmentDownload).toHaveBeenCalledWith(
        'acme',
        'authentication',
        RUN_ID,
        ITEM_ID,
        RESULT_ID,
        ATTACHMENT_ID,
      ),
    );
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
  });
});
