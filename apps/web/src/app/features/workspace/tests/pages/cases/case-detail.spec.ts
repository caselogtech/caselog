import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type {
  CaseAttachmentListResponse,
  CaseExecutionHistoryResponse,
  ProjectStructureResponse,
  TestCaseDetailResponse,
  UpdateTestCaseResponse,
} from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { WorkspaceApi } from '../../../data-access/workspace-api';
import { CaseDetail } from '../../../pages/cases/case-detail';

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

const executionHistory: CaseExecutionHistoryResponse = {
  project: detail.project,
  testCase: {
    id: caseId,
    caseNumber: '42',
    title: detail.testCase.currentVersion.title,
  },
  items: [
    {
      runItemId: '6556621a-35f4-4719-b78c-0726ae0f65dc',
      result: {
        id: '11851619-3a04-4240-a9ce-e0d5abef0272',
        attempt: 2,
        status: {
          id: 'b0529f51-0af7-4202-92c7-e8125269ca50',
          key: 'passed',
          name: 'Passed',
          color: '#16A34A',
          isFinal: true,
          countsAsFailure: false,
        },
        comment: 'Passed after retry',
        elapsedMs: 4_000,
        executedAt: '2026-08-02T13:00:00.000Z',
        executedBy: {
          id: 'add2bb85-bfcb-435a-94d8-65f72879e9c3',
          displayName: 'Quality Owner',
        },
        build: 'rc-2',
      },
      run: {
        id: '09cbd4a7-1263-45cc-98f1-d3a169395746',
        name: 'Release regression',
        status: 'completed',
        build: 'rc-2',
        createdAt: '2026-08-02T12:00:00.000Z',
        closedAt: '2026-08-02T14:00:00.000Z',
      },
      caseVersion: {
        id: detail.testCase.currentVersion.id,
        version: 1,
        title: detail.testCase.currentVersion.title,
      },
    },
  ],
  nextCursor: null,
};

const attachments: CaseAttachmentListResponse = {
  items: [
    {
      id: '6fe23247-f3b8-44ec-99fb-f7567940c580',
      fileName: 'valid-login-evidence.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2_048,
      checksumSha256: 'a'.repeat(64),
      createdAt: '2026-08-02T12:30:00.000Z',
    },
  ],
  nextCursor: null,
};

describe('CaseDetail', () => {
  const workspaceApi = {
    testCase: vi.fn(),
    testCaseAttachments: vi.fn(),
    uploadTestCaseAttachment: vi.fn(),
    testCaseAttachmentDownload: vi.fn(),
    testCaseExecutionHistory: vi.fn(),
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
    workspaceApi.testCaseAttachments.mockReset();
    workspaceApi.uploadTestCaseAttachment.mockReset();
    workspaceApi.testCaseAttachmentDownload.mockReset();
    workspaceApi.testCaseExecutionHistory.mockReset();
    workspaceApi.projectStructure.mockReset();
    workspaceApi.updateTestCase.mockReset();
    workspaceApi.testCaseVersion.mockReset();
    workspaceApi.restoreTestCaseVersion.mockReset();
    workspaceApi.testCase.mockResolvedValue(detail);
    workspaceApi.testCaseAttachments.mockResolvedValue(attachments);
    workspaceApi.testCaseExecutionHistory.mockResolvedValue(executionHistory);
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

  it('renders execution history across test runs', async () => {
    const fixture = TestBed.createComponent(CaseDetail);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.componentInstance.executionHistory.isSuccess()).toBe(true),
    );
    fixture.detectChanges();

    expect(workspaceApi.testCaseExecutionHistory).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      caseId,
      undefined,
    );
    expect(fixture.nativeElement.querySelector('.execution-history')?.textContent).toContain(
      'Release regression',
    );
    expect(fixture.nativeElement.querySelector('.execution-history')?.textContent).toContain(
      'Passed after retry',
    );
  });

  it('renders attachments for the current immutable version', async () => {
    const fixture = TestBed.createComponent(CaseDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.attachments.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(workspaceApi.testCaseAttachments).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      caseId,
      detail.testCase.currentVersion.id,
      undefined,
    );
    expect(fixture.nativeElement.querySelector('.case-attachments')?.textContent).toContain(
      'valid-login-evidence.pdf',
    );
    expect(fixture.nativeElement.querySelector('.case-attachments')?.textContent).toContain(
      '2.0 KB',
    );
  });

  it('uploads a file to the current immutable version', async () => {
    workspaceApi.uploadTestCaseAttachment.mockResolvedValue({ attachment: attachments.items[0] });
    const fixture = TestBed.createComponent(CaseDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));
    const file = new File(['browser evidence'], 'browser-evidence.txt', { type: 'text/plain' });
    const input = {
      files: { item: () => file },
      value: 'browser-evidence.txt',
    } as unknown as HTMLInputElement;

    fixture.componentInstance.selectAttachment({ target: input } as unknown as Event);

    await vi.waitFor(() => expect(workspaceApi.uploadTestCaseAttachment).toHaveBeenCalledOnce());
    expect(workspaceApi.uploadTestCaseAttachment).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      caseId,
      detail.testCase.currentVersion.id,
      file,
    );
    expect(input.value).toBe('');
  });

  it('downloads an attachment through a short-lived URL', async () => {
    workspaceApi.testCaseAttachmentDownload.mockResolvedValue({
      download: {
        url: 'https://storage.example.com/evidence.pdf',
        expiresAt: '2026-08-02T12:35:00.000Z',
      },
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(CaseDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.attachments.isSuccess()).toBe(true));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.case-attachments li button').click();

    await vi.waitFor(() =>
      expect(workspaceApi.testCaseAttachmentDownload).toHaveBeenCalledWith(
        'acme-quality',
        'authentication',
        caseId,
        detail.testCase.currentVersion.id,
        attachments.items[0]?.id,
      ),
    );
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });

  it('renders an attachment loading error with a retry action', async () => {
    workspaceApi.testCaseAttachments.mockRejectedValueOnce(new Error('Storage unavailable'));
    const fixture = TestBed.createComponent(CaseDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.attachments.isError()).toBe(true));
    fixture.detectChanges();

    const section = fixture.nativeElement.querySelector('.case-attachments');
    expect(section.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');
    expect(section.textContent).toContain('Reload attachments');
  });

  it('allows read-only members to download but not upload attachments', async () => {
    TestBed.inject(WorkspaceSession).role.set('read_only');
    const fixture = TestBed.createComponent(CaseDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.attachments.isSuccess()).toBe(true));
    fixture.detectChanges();

    const section = fixture.nativeElement.querySelector('.case-attachments');
    expect(section.querySelector('input[type="file"]')).toBeNull();
    expect(section.querySelector('li button')?.textContent).toContain('Download');
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
