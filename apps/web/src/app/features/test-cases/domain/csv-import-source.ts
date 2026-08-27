import { detectCsvDelimiter, parseCsvHeader, type CsvDelimiter } from './csv-header';

const MAX_CSV_BYTES = 5_000_000;
const COLUMN_ALIASES = {
  title: ['title', 'name', 'testcase', 'testcasetitle'],
  content: ['content', 'description', 'steps', 'teststeps'],
  sectionId: ['sectionid', 'sectionuuid'],
  template: ['template', 'type'],
  automationId: ['automationid', 'automation', 'automatedid'],
  preconditions: ['preconditions', 'precondition'],
  expectedResult: ['expectedresult', 'expected', 'outcome'],
} as const;

export type CsvFileError = 'type' | 'size' | 'empty' | 'read' | 'header';

export type CsvSourceResult =
  | { success: true; csv: string; delimiter: CsvDelimiter; columns: string[] }
  | { success: false; error: CsvFileError };

export async function readCsvSource(file: File): Promise<CsvSourceResult> {
  if (!file.name.toLowerCase().endsWith('.csv')) return { success: false, error: 'type' };
  if (file.size > MAX_CSV_BYTES) return { success: false, error: 'size' };
  if (file.size === 0) return { success: false, error: 'empty' };

  let csv: string;
  try {
    csv = await file.text();
  } catch {
    return { success: false, error: 'read' };
  }
  if (!csv.trim()) return { success: false, error: 'empty' };

  try {
    const delimiter = detectCsvDelimiter(csv);
    return { success: true, csv, delimiter, columns: parseCsvHeader(csv, delimiter) };
  } catch {
    return { success: false, error: 'header' };
  }
}

export function suggestedCsvMapping(
  columns: string[],
): Record<keyof typeof COLUMN_ALIASES, string> {
  const columnByName = new Map(columns.map((column) => [normalizeColumn(column), column]));
  const match = (field: keyof typeof COLUMN_ALIASES): string => {
    for (const alias of COLUMN_ALIASES[field]) {
      const column = columnByName.get(alias);
      if (column) return column;
    }
    return '';
  };

  return {
    title: match('title'),
    content: match('content'),
    sectionId: match('sectionId'),
    template: match('template'),
    automationId: match('automationId'),
    preconditions: match('preconditions'),
    expectedResult: match('expectedResult'),
  };
}

function normalizeColumn(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
