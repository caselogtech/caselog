import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type {
  CsvImportPreviewResponse,
  CsvImportResponse,
  ProjectStructureResponse,
} from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { TestCaseImportsApi } from '../../../data-access/test-case-imports-api';
import { TestCaseStructureApi } from '../../../data-access/test-case-structure-api';
import { CsvImport } from '../../../pages/csv-import/csv-import';

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
const validPreview: CsvImportPreviewResponse = {
  columns: ['Title', 'Automation ID', 'Content'],
  summary: { total: 1, valid: 1, invalid: 0 },
  rows: [
    {
      rowNumber: 2,
      valid: true,
      value: {
        title: 'Login',
        sectionId,
        template: 'steps',
        automationId: 'auth.login',
        content: { steps: [{ action: 'Open form', expected: 'Form opens' }] },
      },
      issues: [],
    },
  ],
};
const imported: CsvImportResponse = {
  imported: 1,
  testCases: [
    {
      id: '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
      caseNumber: '43',
      title: 'Login',
    },
  ],
};

describe('CsvImport', () => {
  const importsApi = {
    previewCsvImport: vi.fn(),
    commitCsvImport: vi.fn(),
  };
  const structureApi = { projectStructure: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    structureApi.projectStructure.mockReset().mockResolvedValue(structure);
    importsApi.previewCsvImport.mockReset().mockResolvedValue(validPreview);
    importsApi.commitCsvImport.mockReset().mockResolvedValue(imported);
    await TestBed.configureTestingModule({
      imports: [CsvImport, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: TestCaseImportsApi, useValue: importsApi },
        { provide: TestCaseStructureApi, useValue: structureApi },
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

  it('detects columns, previews valid rows, and commits the exact previewed request', async () => {
    const fixture = TestBed.createComponent(CsvImport);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.structure.isSuccess()).toBe(true));
    await vi.waitFor(() =>
      expect(fixture.componentInstance.mappingForm.controls.defaultSectionId.value).toBe(sectionId),
    );

    const csv = 'Title,Automation ID,Content\nLogin,auth.login,Open form => Form opens';
    await fixture.componentInstance.selectFile(csvFile(csv));
    expect(fixture.componentInstance.columns()).toEqual(['Title', 'Automation ID', 'Content']);
    expect(fixture.componentInstance.mappingForm.getRawValue()).toMatchObject({
      title: 'Title',
      content: 'Content',
      automationId: 'Automation ID',
      defaultSectionId: sectionId,
      defaultTemplate: 'steps',
    });

    fixture.componentInstance.previewImport();
    await vi.waitFor(() => expect(fixture.componentInstance.preview.isSuccess()).toBe(true));
    expect(importsApi.previewCsvImport).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      expect.objectContaining({
        csv,
        delimiter: ',',
        mapping: {
          title: 'Title',
          content: 'Content',
          automationId: 'Automation ID',
        },
        defaults: { sectionId, template: 'steps' },
      }),
    );

    fixture.componentInstance.commitImport();
    await vi.waitFor(() => expect(fixture.componentInstance.commit.isSuccess()).toBe(true));
    expect(importsApi.commitCsvImport).toHaveBeenCalledWith(
      'acme-quality',
      'authentication',
      importsApi.previewCsvImport.mock.calls[0]?.[2],
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1 test cases imported');
    expect(fixture.nativeElement.textContent).toContain('AUTH-43');
  });

  it('keeps commit disabled when the backend reports invalid source rows', async () => {
    importsApi.previewCsvImport.mockResolvedValue({
      columns: ['Title', 'Content'],
      summary: { total: 1, valid: 0, invalid: 1 },
      rows: [
        {
          rowNumber: 2,
          valid: false,
          issues: [
            { field: 'title', message: 'Too small: expected string to have >=1 characters' },
          ],
        },
      ],
    } satisfies CsvImportPreviewResponse);
    const fixture = TestBed.createComponent(CsvImport);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.structure.isSuccess()).toBe(true));
    await fixture.componentInstance.selectFile(csvFile('Title,Content\n,Missing title'));

    fixture.componentInstance.previewImport();
    await vi.waitFor(() => expect(fixture.componentInstance.preview.isSuccess()).toBe(true));
    fixture.detectChanges();

    const commitButton = fixture.nativeElement.querySelector(
      '.preview-panel .primary-action',
    ) as HTMLButtonElement;
    expect(commitButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('The import cannot be committed yet');
    fixture.componentInstance.commitImport();
    expect(importsApi.commitCsvImport).not.toHaveBeenCalled();
  });
});

function csvFile(csv: string): File {
  return {
    name: 'test-cases.csv',
    size: new TextEncoder().encode(csv).byteLength,
    text: () => Promise.resolve(csv),
  } as File;
}
