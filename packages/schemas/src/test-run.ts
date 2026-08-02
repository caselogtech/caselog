import { z } from 'zod';
import { testCaseListResponseSchema, testCaseListParamsSchema } from './test-case.js';

export const testRunStatusSchema = z.enum(['draft', 'active', 'completed', 'archived']);

export const testRunListParamsSchema = testCaseListParamsSchema;

export const testRunListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: testRunStatusSchema.optional(),
});

export const testRunSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(200),
  status: testRunStatusSchema,
  build: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
});

export const testRunListResponseSchema = z.object({
  project: testCaseListResponseSchema.shape.project,
  items: z.array(testRunSummarySchema),
  nextCursor: z.uuid().nullable(),
});

export const createTestRunRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    build: z
      .union([z.string().trim().min(1).max(200), z.literal('')])
      .optional()
      .transform((value) => value || undefined),
    caseIds: z.array(z.uuid()).min(1).max(500),
  })
  .superRefine(({ caseIds }, context) => {
    if (new Set(caseIds).size !== caseIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['caseIds'],
        message: 'Test cases must be unique',
      });
    }
  });

export const createTestRunResponseSchema = z.object({ run: testRunSummarySchema });

export type TestRunStatus = z.infer<typeof testRunStatusSchema>;
export type TestRunListParams = z.infer<typeof testRunListParamsSchema>;
export type TestRunListQuery = z.infer<typeof testRunListQuerySchema>;
export type TestRunSummary = z.infer<typeof testRunSummarySchema>;
export type TestRunListResponse = z.infer<typeof testRunListResponseSchema>;
export type CreateTestRunRequest = z.infer<typeof createTestRunRequestSchema>;
export type CreateTestRunResponse = z.infer<typeof createTestRunResponseSchema>;
