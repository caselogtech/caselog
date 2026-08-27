import { detectCsvDelimiter, parseCsvHeader } from '../../domain/csv-header';

describe('CSV header', () => {
  it('detects delimiters and parses quoted column names', () => {
    const csv = '\uFEFF"Test; title";Section;Content\nLogin;auth;Open form';

    expect(detectCsvDelimiter(csv)).toBe(';');
    expect(parseCsvHeader(csv, ';')).toEqual(['Test; title', 'Section', 'Content']);
  });

  it('rejects structurally invalid headers before mapping', () => {
    expect(() => parseCsvHeader('Title,,Content\nLogin,,Body', ',')).toThrow(
      'CSV column names cannot be empty',
    );
    expect(() => parseCsvHeader('Title,Title\nOne,Two', ',')).toThrow(
      'CSV column names must be unique',
    );
    expect(() => parseCsvHeader('"Title,Content', ',')).toThrow('unclosed quoted value');
  });
});
