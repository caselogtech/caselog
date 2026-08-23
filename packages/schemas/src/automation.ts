import { z } from 'zod';
import { testCaseListParamsSchema, testCaseListResponseSchema } from './test-case.js';

export const resultIngestionFormatSchema = z.literal('junit');
export const resultIngestionStatusSchema = z.enum(['completed', 'failed']);
export const resultIngestionListParamsSchema = testCaseListParamsSchema;
export const resultIngestionListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: resultIngestionStatusSchema.optional(),
});

export const resultIngestionSchema = z.object({
  id: z.uuid(),
  run: z.object({
    id: z.uuid(),
    name: z.string().min(1).max(200),
    build: z.string().nullable(),
  }),
  format: resultIngestionFormatSchema,
  status: resultIngestionStatusSchema,
  source: z.string().min(1).max(120),
  pipeline: z.string().min(1).max(200).nullable(),
  branch: z.string().min(1).max(255).nullable(),
  total: z.number().int().nonnegative(),
  recorded: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
  truncated: z.number().int().nonnegative(),
  counts: z.object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  error: z
    .object({
      code: z.string().min(1).max(100),
      message: z.string().min(1).max(1000),
    })
    .nullable(),
  initiatedBy: z
    .object({
      id: z.uuid(),
      displayName: z.string().min(1).max(120),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
});

export const resultIngestionSummarySchema = z.object({
  reportsThisWeek: z.number().int().nonnegative(),
  matchedPercentThisWeek: z.number().int().min(0).max(100),
  unmatchedThisWeek: z.number().int().nonnegative(),
});

export const resultIngestionListResponseSchema = z.object({
  project: testCaseListResponseSchema.shape.project,
  summary: resultIngestionSummarySchema,
  items: z.array(resultIngestionSchema),
  nextCursor: z.uuid().nullable(),
});

export type ResultIngestionFormat = z.infer<typeof resultIngestionFormatSchema>;
export type ResultIngestionStatus = z.infer<typeof resultIngestionStatusSchema>;
export type ResultIngestionListParams = z.infer<typeof resultIngestionListParamsSchema>;
export type ResultIngestionListQuery = z.infer<typeof resultIngestionListQuerySchema>;
export type ResultIngestion = z.infer<typeof resultIngestionSchema>;
export type ResultIngestionSummary = z.infer<typeof resultIngestionSummarySchema>;
export type ResultIngestionListResponse = z.infer<typeof resultIngestionListResponseSchema>;
