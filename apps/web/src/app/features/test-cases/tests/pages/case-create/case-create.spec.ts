import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import type { CreateTestCaseResponse, ProjectStructureResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { TestCaseStructureApi } from '../../../data-access/test-case-structure-api';
import { TestCasesApi } from '../../../data-access/test-cases-api';
import { CaseCreate } from '../../../pages/case-create/case-create';

const sectionId = 'cc4201aa-51f1-4a1b-898d-8d208d475ed3';

const structure: ProjectStructureResponse = {
  project: {
    id: 'c684c153-3802-49c7-94d1-a443262a9129',
    key: 'AUTH',
    slug: 'authentication',
    name: 'Authentication Project',
  },
  suites: [
    {
      id: '275823d3-8b7d-4772-8f07-a597bd07426c',
      name: 'Authentication suite',
      position: 0,
      sections: [
        {
          id: sectionId,
          parentId: null,
          name: 'Sign in',
          depth: 0,
          position: 0,
        },
      ],
    },
  ],
};

const created: CreateTestCaseResponse = {
  testCase: {
    id: '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
    caseNumber: '43',
    title: 'Sign in with a passkey',
    template: 'steps',
    automationId: 'auth.passkey',
    section: { id: sectionId, name: 'Sign in' },
    updatedAt: '2026-08-02T12:00:00.000Z',
  },
  version: { id: '7eb03420-da8e-4975-a1bc-0ca0bf97e9b2', version: 1 },
};

describe('CaseCreate', () => {
  const structureApi = { projectStructure: vi.fn() };
  const testCasesApi = { createTestCase: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    structureApi.projectStructure.mockReset();
    testCasesApi.createTestCase.mockReset();
    structureApi.projectStructure.mockResolvedValue(structure);
    await TestBed.configureTestingModule({
      imports: [CaseCreate, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: TestCaseStructureApi, useValue: structureApi },
        { provide: TestCasesApi, useValue: testCasesApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ org: 'acme-quality', project: 'authentication' }),
            },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('creates a steps case in the first available section', async () => {
    testCasesApi.createTestCase.mockResolvedValue(created);
    const fixture = TestBed.createComponent(CaseCreate);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.structure.isSuccess()).toBe(true));
    await vi.waitFor(() =>
      expect(fixture.componentInstance.form.controls.sectionId.value).toBe(sectionId),
    );

    fixture.componentInstance.form.patchValue({
      title: 'Sign in with a passkey',
      automationId: 'auth.passkey',
      preconditions: 'A passkey is registered',
      expectedResult: 'The user reaches the dashboard',
    });
    fixture.componentInstance.form.controls.steps.at(0).setValue({
      action: 'Use the registered passkey',
      expected: 'Authentication succeeds',
    });
    fixture.componentInstance.submit();

    await vi.waitFor(() => expect(testCasesApi.createTestCase).toHaveBeenCalledOnce());
    expect(testCasesApi.createTestCase).toHaveBeenCalledWith('acme-quality', 'authentication', {
      title: 'Sign in with a passkey',
      sectionId,
      template: 'steps',
      automationId: 'auth.passkey',
      preconditions: 'A passkey is registered',
      expectedResult: 'The user reaches the dashboard',
      content: {
        steps: [{ action: 'Use the registered passkey', expected: 'Authentication succeeds' }],
      },
    });
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(['/', 'acme-quality', 'authentication', 'cases'], {
        queryParams: { section: sectionId },
      }),
    );
  });

  it('requires content for the selected template', async () => {
    const fixture = TestBed.createComponent(CaseCreate);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.structure.isSuccess()).toBe(true));
    fixture.componentInstance.form.patchValue({
      title: 'Session timeout behavior',
      template: 'text',
    });

    fixture.componentInstance.submit();

    expect(testCasesApi.createTestCase).not.toHaveBeenCalled();
    expect(fixture.componentInstance.form.controls.text.invalid).toBe(true);
    expect(fixture.componentInstance.form.controls.text.touched).toBe(true);
  });
});
