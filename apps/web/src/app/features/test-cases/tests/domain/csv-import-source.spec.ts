import { readCsvSource, suggestedCsvMapping } from '../../domain/csv-import-source';

describe('CSV import source', () => {
  it('reads a CSV source and detects its delimiter', async () => {
    const result = await readCsvSource(csvFile('Title;Test Steps\nLogin;Open form'));

    expect(result).toEqual({
      success: true,
      csv: 'Title;Test Steps\nLogin;Open form',
      delimiter: ';',
      columns: ['Title', 'Test Steps'],
    });
  });

  it.each([
    ['cases.txt', 10, 'Title,Content', 'type'],
    ['cases.csv', 5_000_001, 'Title,Content', 'size'],
    ['cases.csv', 0, '', 'empty'],
  ] as const)('rejects an invalid source file', async (name, size, content, error) => {
    await expect(readCsvSource(csvFile(content, name, size))).resolves.toEqual({
      success: false,
      error,
    });
  });

  it('suggests mappings from normalized column aliases', () => {
    expect(
      suggestedCsvMapping(['Test Case Title', 'Test Steps', 'Automation-ID', 'Outcome']),
    ).toMatchObject({
      title: 'Test Case Title',
      content: 'Test Steps',
      automationId: 'Automation-ID',
      expectedResult: 'Outcome',
    });
  });
});

function csvFile(content: string, name = 'cases.csv', size = content.length): File {
  return { name, size, text: () => Promise.resolve(content) } as File;
}
