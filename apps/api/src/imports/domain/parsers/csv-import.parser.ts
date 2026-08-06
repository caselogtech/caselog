import {
  createTestCaseRequestSchema,
  type CsvImportPreviewResponse,
  type CsvImportRequest,
  type TestCaseTemplate,
} from '@caselog/schemas';
import { parse } from 'csv-parse/sync';
import { CsvImportParseError } from '../errors/csv-import-parse.error';

const MAX_ROWS = 1_000;

export function parseCsvImport(request: CsvImportRequest): CsvImportPreviewResponse {
  const table = parseTable(request.csv, request.delimiter);
  const [rawColumns, ...dataRows] = table;
  if (!rawColumns) throw new CsvImportParseError('The CSV file must contain a header row');
  if (dataRows.length > MAX_ROWS) {
    throw new CsvImportParseError(`A CSV import is limited to ${MAX_ROWS} data rows`, {
      maxRows: MAX_ROWS,
    });
  }

  const columns = rawColumns.map((column) => column.trim());
  validateColumns(columns, request);
  const columnIndex = new Map(columns.map((column, index) => [column, index]));
  const rows = dataRows.map((row, index) => parseRow(row, index + 2, columnIndex, request));
  const valid = rows.filter((row) => row.valid).length;
  return {
    columns,
    summary: { total: rows.length, valid, invalid: rows.length - valid },
    rows,
  };
}

function parseTable(csv: string, delimiter: CsvImportRequest['delimiter']): string[][] {
  try {
    return parse(csv, {
      bom: true,
      delimiter,
      relax_column_count: false,
      skip_empty_lines: true,
    }) as string[][];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CSV parsing error';
    throw new CsvImportParseError('The CSV document is malformed', { parserMessage: message });
  }
}

function validateColumns(columns: string[], request: CsvImportRequest): void {
  if (columns.some((column) => column.length === 0)) {
    throw new CsvImportParseError('CSV column names cannot be empty');
  }
  const duplicate = columns.find((column, index) => columns.indexOf(column) !== index);
  if (duplicate) throw new CsvImportParseError('CSV column names must be unique', { duplicate });

  const mappedColumns = Object.values(request.mapping).filter(
    (column): column is string => column !== undefined,
  );
  const missing = mappedColumns.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    throw new CsvImportParseError('Mapped columns are missing from the CSV header', { missing });
  }
}

function parseRow(
  row: string[],
  rowNumber: number,
  columns: Map<string, number>,
  request: CsvImportRequest,
): CsvImportPreviewResponse['rows'][number] {
  const read = (field: keyof CsvImportRequest['mapping']): string | undefined => {
    const column = request.mapping[field];
    if (!column) return undefined;
    const index = columns.get(column);
    return index === undefined ? undefined : row[index]?.trim();
  };
  const templateValue = read('template') || request.defaults.template;
  const template = templateValue?.toLowerCase() as TestCaseTemplate | undefined;
  const rawContent = read('content') ?? '';
  const candidate = {
    title: read('title') ?? '',
    sectionId: read('sectionId') || request.defaults.sectionId,
    template,
    automationId: read('automationId'),
    preconditions: read('preconditions'),
    expectedResult: read('expectedResult'),
    content: parseContent(template, rawContent),
  };
  const parsed = createTestCaseRequestSchema.safeParse(candidate);
  if (parsed.success) return { rowNumber, valid: true, value: parsed.data, issues: [] };
  return {
    rowNumber,
    valid: false,
    issues: parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'row',
      message: issue.message,
    })),
  };
}

function parseContent(template: TestCaseTemplate | undefined, content: string): unknown {
  if (template === 'text') return { text: content };
  if (template === 'exploratory') return { charter: content };
  if (template === 'bdd') return { gherkin: content };
  if (template !== 'steps') return content;

  if (content.trim().startsWith('[')) {
    try {
      return { steps: JSON.parse(content) };
    } catch {
      return { steps: [] };
    }
  }
  return {
    steps: content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=>');
        return separator === -1
          ? { action: line }
          : {
              action: line.slice(0, separator).trim(),
              expected: line.slice(separator + 2).trim(),
            };
      }),
  };
}
