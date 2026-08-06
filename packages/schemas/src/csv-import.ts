import { z } from 'zod';
import { projectSlugSchema } from './project.js';
import { createTestCaseRequestSchema, testCaseTemplateSchema } from './test-case.js';

const csvColumnSchema = z.string().trim().min(1).max(200);

export const csvImportParamsSchema = z.object({ projectSlug: projectSlugSchema });

export const csvImportMappingSchema = z.object({
  title: csvColumnSchema,
  sectionId: csvColumnSchema.optional(),
  template: csvColumnSchema.optional(),
  automationId: csvColumnSchema.optional(),
  preconditions: csvColumnSchema.optional(),
  expectedResult: csvColumnSchema.optional(),
  content: csvColumnSchema,
});

export const csvImportRequestSchema = z
  .object({
    csv: z.string().min(1).max(5_000_000),
    delimiter: z.enum([',', ';', '\t']).default(','),
    mapping: csvImportMappingSchema,
    defaults: z
      .object({
        sectionId: z.uuid().optional(),
        template: testCaseTemplateSchema.optional(),
      })
      .default({}),
  })
  .superRefine((request, context) => {
    if (!request.mapping.sectionId && !request.defaults.sectionId) {
      context.addIssue({
        code: 'custom',
        path: ['defaults', 'sectionId'],
        message: 'A sectionId column or default sectionId is required',
      });
    }
    if (!request.mapping.template && !request.defaults.template) {
      context.addIssue({
        code: 'custom',
        path: ['defaults', 'template'],
        message: 'A template column or default template is required',
      });
    }
  });

export const csvImportHeadersSchema = z.object({
  'idempotency-key': z.string().trim().min(1).max(200),
});

export const csvImportIssueSchema = z.object({
  field: z.string().min(1),
  message: z.string().min(1),
});

export const csvImportPreviewRowSchema = z.object({
  rowNumber: z.number().int().min(2),
  valid: z.boolean(),
  value: createTestCaseRequestSchema.optional(),
  issues: z.array(csvImportIssueSchema),
});

export const csvImportPreviewResponseSchema = z.object({
  columns: z.array(csvColumnSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    valid: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
  }),
  rows: z.array(csvImportPreviewRowSchema).max(1_000),
});

export const csvImportResponseSchema = z.object({
  imported: z.number().int().positive(),
  testCases: z.array(
    z.object({
      id: z.uuid(),
      caseNumber: z.string().regex(/^[1-9]\d*$/),
      title: z.string().min(1).max(500),
    }),
  ),
});

export type CsvImportRequest = z.infer<typeof csvImportRequestSchema>;
export type CsvImportPreviewRow = z.infer<typeof csvImportPreviewRowSchema>;
export type CsvImportPreviewResponse = z.infer<typeof csvImportPreviewResponseSchema>;
export type CsvImportResponse = z.infer<typeof csvImportResponseSchema>;
