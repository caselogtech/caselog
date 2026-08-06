import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CsvImportParseError } from '../../domain/errors/csv-import-parse.error';
import { parseCsvImport } from '../../domain/parsers/csv-import.parser';

describe('CSV import parser', () => {
  it('parses quoted fields and friendly step syntax', () => {
    const sectionId = randomUUID();
    const preview = parseCsvImport({
      csv: '\uFEFFTitle,Automation,Content\n"Checkout, card",checkout.card,"Open cart => Cart opens\nPay => Receipt appears"',
      delimiter: ',',
      mapping: { title: 'Title', automationId: 'Automation', content: 'Content' },
      defaults: { sectionId, template: 'steps' },
    });

    expect(preview.summary).toEqual({ total: 1, valid: 1, invalid: 0 });
    expect(preview.rows[0]?.value).toMatchObject({
      title: 'Checkout, card',
      sectionId,
      template: 'steps',
      automationId: 'checkout.card',
      content: {
        steps: [
          { action: 'Open cart', expected: 'Cart opens' },
          { action: 'Pay', expected: 'Receipt appears' },
        ],
      },
    });
  });

  it('reports invalid rows without rejecting the whole preview', () => {
    const preview = parseCsvImport({
      csv: 'Title;Content\n;Missing title',
      delimiter: ';',
      mapping: { title: 'Title', content: 'Content' },
      defaults: { sectionId: randomUUID(), template: 'text' },
    });

    expect(preview.summary).toEqual({ total: 1, valid: 0, invalid: 1 });
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 2,
      valid: false,
      issues: expect.arrayContaining([expect.objectContaining({ field: 'title' })]),
    });
  });

  it('rejects mappings that reference absent columns', () => {
    expect(() =>
      parseCsvImport({
        csv: 'Title,Content\nCase,Body',
        delimiter: ',',
        mapping: { title: 'Missing', content: 'Content' },
        defaults: { sectionId: randomUUID(), template: 'text' },
      }),
    ).toThrow(CsvImportParseError);
  });
});
