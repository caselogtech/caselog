import { TestBed } from '@angular/core/testing';
import type { ProjectStructureResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { CaseRepositorySidebar } from '../../../components/case-repository-sidebar/case-repository-sidebar';
import { TestCaseStructureApi } from '../../../data-access/test-case-structure-api';

const SECTION_ID = 'cc4201aa-51f1-4a1b-898d-8d208d475ed3';
const SUITE_ID = '275823d3-8b7d-4772-8f07-a597bd07426c';

const structure: ProjectStructureResponse = {
  project: {
    id: 'c684c153-3802-49c7-94d1-a443262a9129',
    key: 'AUTH',
    slug: 'authentication',
    name: 'Authentication Project',
  },
  suites: [
    {
      id: SUITE_ID,
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

describe('CaseRepositorySidebar', () => {
  const structureApi = {
    projectStructure: vi.fn(),
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
    Object.values(structureApi).forEach((mock) => {
      mock.mockReset();
    });
    structureApi.projectStructure.mockResolvedValue(structure);
    await TestBed.configureTestingModule({
      imports: [CaseRepositorySidebar, i18nTestingModule()],
      providers: [
        provideTanStackQuery(queryClient),
        { provide: TestCaseStructureApi, useValue: structureApi },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  function createComponent() {
    const fixture = TestBed.createComponent(CaseRepositorySidebar);
    fixture.componentRef.setInput('workspaceSlug', 'acme-quality');
    fixture.componentRef.setInput('projectSlug', 'authentication');
    fixture.componentRef.setInput('projectName', 'Authentication Project');
    fixture.componentRef.setInput('projectKey', 'AUTH');
    fixture.detectChanges();
    return fixture;
  }

  it('renders the project structure and emits section selection', async () => {
    const fixture = createComponent();
    const selected = vi.fn();
    fixture.componentInstance.sectionSelected.subscribe(selected);
    await vi.waitFor(() => expect(fixture.componentInstance.structure.isSuccess()).toBe(true));
    fixture.detectChanges();

    const sectionButton = [...fixture.nativeElement.querySelectorAll('.section-link')].find(
      (button: HTMLElement) => button.textContent?.includes('Sign in'),
    ) as HTMLButtonElement;
    sectionButton.click();

    expect(selected).toHaveBeenCalledWith(SECTION_ID);
  });

  it('creates a suite and refreshes the project structure', async () => {
    structureApi.createSuite.mockResolvedValue({
      id: '67e2afe7-bd67-4039-a332-e4e4bddb9ac6',
      name: 'Account security',
      position: 1,
    });
    const fixture = createComponent();
    await vi.waitFor(() => expect(fixture.componentInstance.structure.isSuccess()).toBe(true));

    fixture.componentInstance.suiteForm.controls.name.setValue('Account security');
    fixture.componentInstance.submitSuite();

    await vi.waitFor(() => expect(structureApi.createSuite).toHaveBeenCalledOnce());
    expect(structureApi.createSuite).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      'Account security',
    );
  });

  it('reorders, moves, and safely deletes structure items', async () => {
    structureApi.moveSuite.mockResolvedValue({
      id: SUITE_ID,
      name: 'Authentication suite',
      position: 1,
    });
    structureApi.moveSection.mockResolvedValue({
      id: SECTION_ID,
      suiteId: SUITE_ID,
      parentId: null,
      name: 'Sign in',
      depth: 0,
      position: 1,
    });
    structureApi.deleteSection.mockResolvedValue(undefined);
    const fixture = createComponent();
    await vi.waitFor(() => expect(fixture.componentInstance.structure.isSuccess()).toBe(true));

    fixture.componentInstance.moveSuite(SUITE_ID, 1);
    await vi.waitFor(() => expect(structureApi.moveSuite).toHaveBeenCalledOnce());

    fixture.componentInstance.beginMoveSection(SECTION_ID, SUITE_ID, 0);
    fixture.componentInstance.moveForm.controls.position.setValue(1);
    fixture.componentInstance.submitMoveSection();
    await vi.waitFor(() => expect(structureApi.moveSection).toHaveBeenCalledOnce());
    expect(structureApi.moveSection).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      SECTION_ID,
      { suiteId: SUITE_ID, parentId: null, position: 1 },
    );

    fixture.componentInstance.requestDelete('section', SECTION_ID);
    fixture.componentInstance.confirmDelete();
    await vi.waitFor(() => expect(structureApi.deleteSection).toHaveBeenCalledOnce());
  });
});
