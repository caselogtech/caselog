import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { TestResultHistoryResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { TestRunsApi } from '../../../data-access/test-runs-api';
import { ResultHistory } from '../../../pages/result-history/result-history';

const RUN_ID = 'b101eace-107c-4177-8d7c-f4f052785c16';
const ITEM_ID = 'f230fe74-dd2d-40db-a0a4-21a8597526ef';
const RESULT_ID = '4c305be5-9ab8-4ef4-889c-08b666b5d402';
const response: TestResultHistoryResponse = {
  item: { id: ITEM_ID, title: 'Sign in' },
  results: [
    {
      id: RESULT_ID,
      attempt: 2,
      status: {
        id: 'f03a1a64-f159-4f39-86ca-c21b135d6815',
        key: 'passed',
        name: 'Passed',
        color: '#16A34A',
        isFinal: true,
        countsAsFailure: false,
      },
      comment: 'Retest passed',
      elapsedMs: 2_000,
      executedBy: { id: '882c64fe-a728-40a0-91a9-96c74f585895', displayName: 'Ada' },
      executedAt: '2026-08-02T12:01:00.000Z',
      stepResults: [],
      attachments: [
        {
          id: '6fe23247-f3b8-44ec-99fb-f7567940c580',
          fileName: 'failed-login.png',
          contentType: 'image/png',
          sizeBytes: 2_048,
          checksumSha256: 'a'.repeat(64),
          stepPosition: 0,
        },
      ],
    },
  ],
  nextCursor: null,
};

describe('ResultHistory', () => {
  const workspaceApi = { testResultHistory: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.testResultHistory.mockReset().mockResolvedValue(response);
    await TestBed.configureTestingModule({
      imports: [ResultHistory, i18nTestingModule()],
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
                itemId: ITEM_ID,
              }),
            },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders immutable attempts and their execution metadata', async () => {
    const fixture = TestBed.createComponent(ResultHistory);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.history.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(workspaceApi.testResultHistory).toHaveBeenCalledWith(
      'acme',
      'authentication',
      RUN_ID,
      ITEM_ID,
      undefined,
    );
    expect(fixture.nativeElement.textContent).toContain('Sign in');
    expect(fixture.nativeElement.textContent).toContain('Retest passed');
    expect(fixture.nativeElement.textContent).toContain('Ada');
    expect(fixture.nativeElement.querySelector('.attempt-link')?.getAttribute('href')).toBe(
      `/acme/authentication/runs/${RUN_ID}/items/${ITEM_ID}/results/${RESULT_ID}`,
    );
    expect(fixture.nativeElement.querySelector('.back-link')?.getAttribute('href')).toBe(
      `/acme/authentication/runs/${RUN_ID}?item=${ITEM_ID}`,
    );
  });
});
