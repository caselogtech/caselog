import { z } from 'zod';
import {
  testCaseContentSchema,
  testCaseListParamsSchema,
  testCaseListResponseSchema,
  testCaseTemplateSchema,
} from './test-case.js';

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

export const testRunDetailParamsSchema = testRunListParamsSchema.extend({ runId: z.uuid() });
export const testRunItemParamsSchema = testRunDetailParamsSchema.extend({ itemId: z.uuid() });
export const testRunDetailQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const resultStatusResponseSchema = z.object({
  id: z.uuid(),
  key: z.string().min(1).max(50),
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  isFinal: z.boolean(),
  countsAsFailure: z.boolean(),
});

export const runMemberResponseSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1).max(120),
});

export const testRunItemResponseSchema = z.object({
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  caseVersion: z.object({
    id: z.uuid(),
    version: z.number().int().positive(),
    title: z.string().min(1).max(500),
    template: testCaseTemplateSchema,
    preconditions: z.string().nullable(),
    expectedResult: z.string().nullable(),
    content: testCaseContentSchema,
  }),
  status: resultStatusResponseSchema,
  assignee: runMemberResponseSchema.nullable(),
  attemptCount: z.number().int().nonnegative(),
});

export const testRunDetailResponseSchema = z.object({
  project: testCaseListResponseSchema.shape.project,
  run: testRunSummarySchema,
  items: z.array(testRunItemResponseSchema),
  nextCursor: z.uuid().nullable(),
  members: z.array(runMemberResponseSchema),
  statuses: z.array(resultStatusResponseSchema),
});

export const assignTestRunItemRequestSchema = z.object({ assigneeId: z.uuid().nullable() });
export const assignTestRunItemResponseSchema = z.object({
  itemId: z.uuid(),
  assignee: runMemberResponseSchema.nullable(),
});

export const createTestResultRequestSchema = z.object({
  statusId: z.uuid(),
  comment: z.string().trim().max(50_000).optional(),
  elapsedMs: z.number().int().nonnegative().max(86_400_000).optional(),
});

export const createTestResultResponseSchema = z.object({
  result: z.object({
    id: z.uuid(),
    attempt: z.number().int().positive(),
    status: resultStatusResponseSchema,
    comment: z.string().nullable(),
    elapsedMs: z.number().int().nonnegative().nullable(),
    executedBy: runMemberResponseSchema.nullable(),
    executedAt: z.iso.datetime(),
  }),
});

export const testRunLifecycleResponseSchema = z.object({ run: testRunSummarySchema });

export type TestRunStatus = z.infer<typeof testRunStatusSchema>;
export type TestRunListParams = z.infer<typeof testRunListParamsSchema>;
export type TestRunListQuery = z.infer<typeof testRunListQuerySchema>;
export type TestRunSummary = z.infer<typeof testRunSummarySchema>;
export type TestRunListResponse = z.infer<typeof testRunListResponseSchema>;
export type CreateTestRunRequest = z.infer<typeof createTestRunRequestSchema>;
export type CreateTestRunResponse = z.infer<typeof createTestRunResponseSchema>;
export type TestRunDetailParams = z.infer<typeof testRunDetailParamsSchema>;
export type TestRunItemParams = z.infer<typeof testRunItemParamsSchema>;
export type TestRunDetailQuery = z.infer<typeof testRunDetailQuerySchema>;
export type ResultStatusResponse = z.infer<typeof resultStatusResponseSchema>;
export type RunMemberResponse = z.infer<typeof runMemberResponseSchema>;
export type TestRunItemResponse = z.infer<typeof testRunItemResponseSchema>;
export type TestRunDetailResponse = z.infer<typeof testRunDetailResponseSchema>;
export type AssignTestRunItemRequest = z.infer<typeof assignTestRunItemRequestSchema>;
export type AssignTestRunItemResponse = z.infer<typeof assignTestRunItemResponseSchema>;
export type CreateTestResultRequest = z.infer<typeof createTestResultRequestSchema>;
export type CreateTestResultResponse = z.infer<typeof createTestResultResponseSchema>;
export type TestRunLifecycleResponse = z.infer<typeof testRunLifecycleResponseSchema>;
