import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import type { TestCaseListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../testing/i18n-testing';
import { WorkspaceApi } from '../workspace-api';
import { RunCreate } from './run-create';

const CASE_ID = '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187';
const cases: TestCaseListResponse = {
  project: {
    id: 'c684c153-3802-49c7-94d1-a443262a9129',
    key: 'AUTH',
    slug: 'authentication',
    name: 'Authentication Project',
  },
  items: [
    {
      id: CASE_ID,
      caseNumber: '1',
      title: 'Sign in',
      template: 'steps',
      automationId: null,
      section: { id: 'cc4201aa-51f1-4a1b-898d-8d208d475ed3', name: 'Authentication' },
      updatedAt: '2026-08-02T12:00:00.000Z',
    },
  ],
  nextCursor: null,
};

describe('RunCreate', () => {
  const workspaceApi = { listTestCases: vi.fn(), createTestRun: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.listTestCases.mockReset().mockResolvedValue(cases);
    workspaceApi.createTestRun.mockReset().mockResolvedValue({
      run: {
        id: 'b101eace-107c-4177-8d7c-f4f052785c16',
        name: 'Regression',
        status: 'active',
        build: null,
        itemCount: 1,
        completedCount: 0,
        failedCount: 0,
        createdAt: '2026-08-02T12:00:00.000Z',
        closedAt: null,
      },
    });
    await TestBed.configureTestingModule({
      imports: [RunCreate, i18nTestingModule()],
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

  it('creates a run from selected current cases', async () => {
    const fixture = TestBed.createComponent(RunCreate);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.cases.isSuccess()).toBe(true));
    fixture.componentInstance.form.setValue({ name: ' Regression ', build: '' });
    fixture.componentInstance.toggleCase(CASE_ID, true);
    fixture.componentInstance.submit();

    await vi.waitFor(() => expect(workspaceApi.createTestRun).toHaveBeenCalledOnce());
    expect(workspaceApi.createTestRun).toHaveBeenCalledWith('acme', 'authentication', {
      name: 'Regression',
      build: undefined,
      caseIds: [CASE_ID],
    });
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(['/', 'acme', 'authentication', 'runs']),
    );
  });
});
