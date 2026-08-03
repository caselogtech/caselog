import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import type { ProjectStructureResponse, TestCaseListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceApi } from '../../../data-access/workspace-api';
import { CaseList } from '../../../pages/cases/case-list';

const SECTION_ID = 'cc4201aa-51f1-4a1b-898d-8d208d475ed3';

const response: TestCaseListResponse = {
  project: {
    id: 'c684c153-3802-49c7-94d1-a443262a9129',
    key: 'AUTH',
    slug: 'authentication',
    name: 'Authentication Project',
  },
  items: [
    {
      id: '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
      caseNumber: '42',
      title: 'Reject an invalid password',
      template: 'steps',
      automationId: 'auth.invalid-password',
      section: {
        id: SECTION_ID,
        name: 'Sign in',
      },
      updatedAt: '2026-08-02T12:00:00.000Z',
    },
  ],
  nextCursor: null,
};

const structure: ProjectStructureResponse = {
  project: response.project,
  suites: [
    {
      id: '275823d3-8b7d-4772-8f07-a597bd07426c',
      name: 'Authentication suite',
      position: 0,
      sections: [
        {
          id: SECTION_ID,
          parentId: null,
          name: 'Sign in',
          depth: 0,
          position: 0,
        },
      ],
    },
  ],
};

describe('CaseList', () => {
  const workspaceApi = {
    listTestCases: vi.fn(),
    projectStructure: vi.fn(),
    duplicateTestCase: vi.fn(),
    archiveTestCase: vi.fn(),
    restoreArchivedTestCase: vi.fn(),
    createSuite: vi.fn(),
    updateSuite: vi.fn(),
    moveSuite: vi.fn(),
    deleteSuite: vi.fn(),
    createSection: vi.fn(),
    updateSection: vi.fn(),
    moveSection: vi.fn(),
    deleteSection: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    workspaceApi.listTestCases.mockReset();
    workspaceApi.projectStructure.mockReset();
    workspaceApi.duplicateTestCase.mockReset();
    workspaceApi.archiveTestCase.mockReset();
    workspaceApi.restoreArchivedTestCase.mockReset();
    workspaceApi.createSuite.mockReset();
    workspaceApi.updateSuite.mockReset();
    workspaceApi.moveSuite.mockReset();
    workspaceApi.deleteSuite.mockReset();
    workspaceApi.createSection.mockReset();
    workspaceApi.updateSection.mockReset();
    workspaceApi.moveSection.mockReset();
    workspaceApi.deleteSection.mockReset();
    workspaceApi.projectStructure.mockResolvedValue(structure);
    await TestBed.configureTestingModule({
      imports: [CaseList, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: WorkspaceApi, useValue: workspaceApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ org: 'acme-quality', project: 'authentication' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders current case versions with their project identifiers', async () => {
    workspaceApi.listTestCases.mockResolvedValue(response);
    const fixture = TestBed.createComponent(CaseList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.cases.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(workspaceApi.listTestCases).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      undefined,
      undefined,
      undefined,
      'active',
    );
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain(
      'Authentication Project',
    );
    expect(fixture.nativeElement.querySelector('.case-id')?.textContent).toContain('AUTH-42');
    expect(fixture.nativeElement.querySelector('.case-title')?.textContent).toContain(
      'Reject an invalid password',
    );
  });

  it('stores search in the URL and refetches the case collection', async () => {
    workspaceApi.listTestCases.mockResolvedValue(response);
    const fixture = TestBed.createComponent(CaseList);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.cases.isSuccess()).toBe(true));

    fixture.componentInstance.searchForm.controls.search.setValue(' invalid password ');
    await fixture.componentInstance.applySearch();
    await vi.waitFor(() =>
      expect(workspaceApi.listTestCases).toHaveBeenLastCalledWith(
        'acme-quality',
        'authentication',
        undefined,
        'invalid password',
        undefined,
        'active',
      ),
    );

    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { search: 'invalid password' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('filters cases by section and stores the selection in the URL', async () => {
    workspaceApi.listTestCases.mockResolvedValue(response);
    const fixture = TestBed.createComponent(CaseList);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.structure.isSuccess()).toBe(true));

    await fixture.componentInstance.selectSection(SECTION_ID);
    await vi.waitFor(() =>
      expect(workspaceApi.listTestCases).toHaveBeenLastCalledWith(
        'acme-quality',
        'authentication',
        undefined,
        undefined,
        SECTION_ID,
        'active',
      ),
    );

    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { section: SECTION_ID },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('shows a search-aware empty state', async () => {
    workspaceApi.listTestCases.mockResolvedValue({ ...response, items: [] });
    const fixture = TestBed.createComponent(CaseList);
    fixture.componentInstance.search.set('missing case');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.cases.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.cases-state')?.textContent).toContain(
      'No matching test cases',
    );
    expect(fixture.nativeElement.querySelector('.cases-state button')).not.toBeNull();
  });

  it('stores archived state in the URL and restores a case', async () => {
    workspaceApi.listTestCases.mockResolvedValue(response);
    workspaceApi.restoreArchivedTestCase.mockResolvedValue({
      testCaseId: response.items[0]?.id,
      state: 'active',
    });
    const fixture = TestBed.createComponent(CaseList);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.cases.isSuccess()).toBe(true));

    await fixture.componentInstance.selectState('archived');
    await vi.waitFor(() =>
      expect(workspaceApi.listTestCases).toHaveBeenLastCalledWith(
        'acme-quality',
        'authentication',
        undefined,
        undefined,
        undefined,
        'archived',
      ),
    );
    fixture.componentInstance.restoreCase.mutate(response.items[0]?.id ?? '');
    await vi.waitFor(() => expect(workspaceApi.restoreArchivedTestCase).toHaveBeenCalledOnce());

    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { state: 'archived' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('creates a suite and refreshes the project structure', async () => {
    workspaceApi.listTestCases.mockResolvedValue(response);
    workspaceApi.createSuite.mockResolvedValue({
      id: '67e2afe7-bd67-4039-a332-e4e4bddb9ac6',
      name: 'Account security',
      position: 1,
    });
    const fixture = TestBed.createComponent(CaseList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.structure.isSuccess()).toBe(true));

    fixture.componentInstance.suiteForm.controls.name.setValue('Account security');
    fixture.componentInstance.submitSuite();

    await vi.waitFor(() => expect(workspaceApi.createSuite).toHaveBeenCalledOnce());
    expect(workspaceApi.createSuite).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      'Account security',
    );
  });

  it('reorders, moves, and safely deletes structure items', async () => {
    workspaceApi.listTestCases.mockResolvedValue(response);
    workspaceApi.moveSuite.mockResolvedValue({
      id: structure.suites[0]?.id,
      name: 'Authentication suite',
      position: 1,
    });
    workspaceApi.moveSection.mockResolvedValue({
      id: SECTION_ID,
      suiteId: structure.suites[0]?.id,
      parentId: null,
      name: 'Sign in',
      depth: 0,
      position: 1,
    });
    workspaceApi.deleteSection.mockResolvedValue(undefined);
    const fixture = TestBed.createComponent(CaseList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.structure.isSuccess()).toBe(true));

    fixture.componentInstance.moveSuite(structure.suites[0]?.id ?? '', 1);
    await vi.waitFor(() => expect(workspaceApi.moveSuite).toHaveBeenCalledOnce());

    fixture.componentInstance.beginMoveSection(SECTION_ID, structure.suites[0]?.id ?? '', 0);
    fixture.componentInstance.moveForm.controls.position.setValue(1);
    fixture.componentInstance.submitMoveSection();
    await vi.waitFor(() => expect(workspaceApi.moveSection).toHaveBeenCalledOnce());
    expect(workspaceApi.moveSection).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      SECTION_ID,
      { suiteId: structure.suites[0]?.id, parentId: null, position: 1 },
    );

    fixture.componentInstance.requestDelete('section', SECTION_ID);
    fixture.componentInstance.confirmDelete();
    await vi.waitFor(() => expect(workspaceApi.deleteSection).toHaveBeenCalledOnce());
  });
});
