import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import type { TestCaseListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { TestCasesApi } from '../../../../test-cases/public-api';
import { WorkspaceApi } from '../../../data-access/workspace-api';
import { RunCreate } from '../../../pages/runs/run-create';

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
  const testCasesApi = { listTestCases: vi.fn() };
  const workspaceApi = { createTestRun: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    testCasesApi.listTestCases.mockReset().mockResolvedValue(cases);
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
        { provide: TestCasesApi, useValue: testCasesApi },
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
      status: 'active',
      caseIds: [CASE_ID],
    });
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith([
        '/',
        'acme',
        'authentication',
        'runs',
        'b101eace-107c-4177-8d7c-f4f052785c16',
      ]),
    );
  });

  it('can save the selected cases as a draft run', async () => {
    const fixture = TestBed.createComponent(RunCreate);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.cases.isSuccess()).toBe(true));
    fixture.componentInstance.form.setValue({ name: 'Release candidate', build: ' 2.4.0-rc.1 ' });
    fixture.componentInstance.toggleVisible(true);
    fixture.componentInstance.submit('draft');

    await vi.waitFor(() => expect(workspaceApi.createTestRun).toHaveBeenCalledOnce());
    expect(workspaceApi.createTestRun).toHaveBeenCalledWith('acme', 'authentication', {
      name: 'Release candidate',
      build: '2.4.0-rc.1',
      status: 'draft',
      caseIds: [CASE_ID],
    });
  });

  it('searches active cases without losing the current selection', async () => {
    const fixture = TestBed.createComponent(RunCreate);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.cases.isSuccess()).toBe(true));
    fixture.componentInstance.toggleCase(CASE_ID, true);
    fixture.componentInstance.searchControl.setValue(' sign in ');
    fixture.componentInstance.applySearch();

    await vi.waitFor(() =>
      expect(testCasesApi.listTestCases).toHaveBeenLastCalledWith(
        'acme',
        'authentication',
        undefined,
        'sign in',
        undefined,
        'active',
        100,
      ),
    );
    expect(fixture.componentInstance.selectedIds().has(CASE_ID)).toBe(true);
  });
});
