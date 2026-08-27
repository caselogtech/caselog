export const CSV_DELIMITERS = [',', ';', '\t'] as const;

export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export function detectCsvDelimiter(csv: string): CsvDelimiter {
  return (
    CSV_DELIMITERS.map((delimiter, priority) => ({
      delimiter,
      priority,
      columnCount: parseCsvHeader(csv, delimiter).length,
    })).sort(
      (left, right) => right.columnCount - left.columnCount || left.priority - right.priority,
    )[0]?.delimiter ?? ','
  );
}

export function parseCsvHeader(csv: string, delimiter: CsvDelimiter): string[] {
  const source = csv.startsWith('\uFEFF') ? csv.slice(1) : csv;
  const columns: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      columns.push(value.trim());
      value = '';
      continue;
    }
    if (!quoted && (character === '\n' || character === '\r')) break;
    value += character;
  }

  if (quoted) throw new Error('The CSV header contains an unclosed quoted value');
  columns.push(value.trim());
  if (columns.every((column) => column.length === 0)) {
    throw new Error('The CSV header is empty');
  }
  if (columns.some((column) => column.length === 0)) {
    throw new Error('CSV column names cannot be empty');
  }
  if (new Set(columns).size !== columns.length) {
    throw new Error('CSV column names must be unique');
  }
  return columns;
}
