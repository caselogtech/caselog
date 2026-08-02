import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type {
  ProjectStructureResponse,
  TestCaseDetailResponse,
  UpdateTestCaseResponse,
} from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../testing/i18n-testing';
import { WorkspaceApi } from '../workspace-api';
import { CaseDetail } from './case-detail';

const caseId = '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187';
const sectionId = 'cc4201aa-51f1-4a1b-898d-8d208d475ed3';

const detail: TestCaseDetailResponse = {
  project: {
    id: 'c684c153-3802-49c7-94d1-a443262a9129',
    key: 'AUTH',
    slug: 'authentication',
    name: 'Authentication Project',
  },
  testCase: {
    id: caseId,
    caseNumber: '42',
    automationId: 'auth.valid-login',
    section: {
      id: sectionId,
      name: 'Sign in',
      suiteId: '275823d3-8b7d-4772-8f07-a597bd07426c',
      suiteName: 'Authentication suite',
    },
    currentVersion: {
      id: '7eb03420-da8e-4975-a1bc-0ca0bf97e9b2',
      version: 1,
      title: 'Sign in with valid credentials',
      template: 'steps',
      preconditions: 'An active account exists',
      expectedResult: 'The dashboard opens',
      content: { steps: [{ action: 'Submit valid credentials', expected: 'Login succeeds' }] },
      createdAt: '2026-08-02T12:00:00.000Z',
      createdBy: {
        id: 'add2bb85-bfcb-435a-94d8-65f72879e9c3',
        displayName: 'Quality Owner',
      },
    },
    versions: [
      {
        id: '7eb03420-da8e-4975-a1bc-0ca0bf97e9b2',
        version: 1,
        title: 'Sign in with valid credentials',
        template: 'steps',
        preconditions: 'An active account exists',
        expectedResult: 'The dashboard opens',
        createdAt: '2026-08-02T12:00:00.000Z',
        createdBy: {
          id: 'add2bb85-bfcb-435a-94d8-65f72879e9c3',
          displayName: 'Quality Owner',
        },
      },
    ],
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-02T12:00:00.000Z',
  },
};

const structure: ProjectStructureResponse = {
  project: detail.project,
  suites: [
    {
      id: detail.testCase.section.suiteId,
      name: detail.testCase.section.suiteName,
      position: 0,
      sections: [{ id: sectionId, parentId: null, name: 'Sign in', depth: 0, position: 0 }],
    },
  ],
};

describe('CaseDetail', () => {
  const workspaceApi = {
    testCase: vi.fn(),
    projectStructure: vi.fn(),
    updateTestCase: vi.fn(),
    testCaseVersion: vi.fn(),
    restoreTestCaseVersion: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    workspaceApi.testCase.mockReset();
    workspaceApi.projectStructure.mockReset();
    workspaceApi.updateTestCase.mockReset();
    workspaceApi.testCaseVersion.mockReset();
    workspaceApi.restoreTestCaseVersion.mockReset();
    workspaceApi.testCase.mockResolvedValue(detail);
    workspaceApi.projectStructure.mockResolvedValue(structure);
    await TestBed.configureTestingModule({
      imports: [CaseDetail, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: WorkspaceApi, useValue: workspaceApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                org: 'acme-quality',
                project: 'authentication',
                caseId,
              }),
            },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders the current version and immutable history', async () => {
    const fixture = TestBed.createComponent(CaseDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain(
      'Sign in with valid credentials',
    );
    expect(fixture.nativeElement.querySelector('.case-body')?.textContent).toContain(
      'Submit valid credentials',
    );
    expect(fixture.nativeElement.querySelector('.version-panel')?.textContent).toContain(
      'Version 1',
    );
  });

  it('saves edits against the loaded base version', async () => {
    const updated: UpdateTestCaseResponse = {
      testCase: {
        id: caseId,
        caseNumber: '42',
        title: 'Sign in with valid account credentials',
        template: 'steps',
        automationId: 'auth.valid-login',
        section: { id: sectionId, name: 'Sign in' },
        updatedAt: '2026-08-02T12:10:00.000Z',
      },
      version: { id: 'e0a758cf-e117-475d-8058-2b9c96d337a6', version: 2 },
    };
    workspaceApi.updateTestCase.mockResolvedValue(updated);
    const fixture = TestBed.createComponent(CaseDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));

    fixture.componentInstance.startEditing();
    fixture.componentInstance.form.controls.title.setValue(
      'Sign in with valid account credentials',
    );
    fixture.componentInstance.submit();

    await vi.waitFor(() => expect(workspaceApi.updateTestCase).toHaveBeenCalledOnce());
    expect(workspaceApi.updateTestCase).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      caseId,
      expect.objectContaining({
        baseVersion: 1,
        title: 'Sign in with valid account credentials',
        sectionId,
        template: 'steps',
        content: {
          steps: [{ action: 'Submit valid credentials', expected: 'Login succeeds' }],
        },
      }),
    );
  });

  it('loads a selected immutable version for inspection', async () => {
    workspaceApi.testCaseVersion.mockResolvedValue(detail.testCase.currentVersion);
    const fixture = TestBed.createComponent(CaseDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));

    fixture.componentInstance.viewVersion(detail.testCase.currentVersion.id);
    await vi.waitFor(() =>
      expect(fixture.componentInstance.selectedVersion.isSuccess()).toBe(true),
    );
    fixture.detectChanges();

    expect(workspaceApi.testCaseVersion).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      caseId,
      detail.testCase.currentVersion.id,
    );
    expect(fixture.nativeElement.querySelector('.version-preview')?.textContent).toContain(
      'Submit valid credentials',
    );
  });
});
