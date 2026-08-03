import { z } from 'zod';
import { testCaseDetailParamsSchema, testCaseListResponseSchema } from './test-case.js';
import {
  resultStatusResponseSchema,
  runMemberResponseSchema,
  testRunDetailParamsSchema,
  testRunSummarySchema,
} from './test-run.js';

export const runProgressParamsSchema = testRunDetailParamsSchema;

export const caseExecutionHistoryParamsSchema = testCaseDetailParamsSchema;
export const caseExecutionHistoryQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const percentageSchema = z.number().min(0).max(100);

export const runProgressStatusSchema = z.object({
  status: resultStatusResponseSchema,
  count: z.number().int().nonnegative(),
  percentage: percentageSchema,
});

export const runProgressAssigneeSchema = z.object({
  assignee: runMemberResponseSchema.nullable(),
  itemCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
});

export const runProgressSuiteSchema = z.object({
  suite: z.object({ id: z.uuid(), name: z.string().min(1).max(120) }),
  itemCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
});

export const runProgressResponseSchema = z.object({
  project: testCaseListResponseSchema.shape.project,
  run: testRunSummarySchema,
  progressPercent: percentageSchema,
  passRate: percentageSchema.nullable(),
  successfulCount: z.number().int().nonnegative(),
  incompleteCount: z.number().int().nonnegative(),
  statuses: z.array(runProgressStatusSchema),
  assignees: z.array(runProgressAssigneeSchema),
  suites: z.array(runProgressSuiteSchema),
});

export const caseExecutionHistoryItemSchema = z.object({
  runItemId: z.uuid(),
  result: z.object({
    id: z.uuid(),
    attempt: z.number().int().positive(),
    status: resultStatusResponseSchema,
    comment: z.string().nullable(),
    elapsedMs: z.number().int().nonnegative().nullable(),
    executedAt: z.iso.datetime(),
    executedBy: runMemberResponseSchema.nullable(),
    build: z.string().nullable(),
  }),
  run: testRunSummarySchema.pick({
    id: true,
    name: true,
    status: true,
    build: true,
    createdAt: true,
    closedAt: true,
  }),
  caseVersion: z.object({
    id: z.uuid(),
    version: z.number().int().positive(),
    title: z.string().min(1).max(500),
  }),
});

export const caseExecutionHistoryResponseSchema = z.object({
  project: testCaseListResponseSchema.shape.project,
  testCase: z.object({
    id: z.uuid(),
    caseNumber: z.string().regex(/^\d+$/),
    title: z.string().min(1).max(500),
  }),
  items: z.array(caseExecutionHistoryItemSchema),
  nextCursor: z.uuid().nullable(),
});

export type RunProgressParams = z.infer<typeof runProgressParamsSchema>;
export type RunProgressStatus = z.infer<typeof runProgressStatusSchema>;
export type RunProgressAssignee = z.infer<typeof runProgressAssigneeSchema>;
export type RunProgressSuite = z.infer<typeof runProgressSuiteSchema>;
export type RunProgressResponse = z.infer<typeof runProgressResponseSchema>;
export type CaseExecutionHistoryParams = z.infer<typeof caseExecutionHistoryParamsSchema>;
export type CaseExecutionHistoryQuery = z.infer<typeof caseExecutionHistoryQuerySchema>;
export type CaseExecutionHistoryItem = z.infer<typeof caseExecutionHistoryItemSchema>;
export type CaseExecutionHistoryResponse = z.infer<typeof caseExecutionHistoryResponseSchema>;
