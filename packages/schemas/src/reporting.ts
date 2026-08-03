import { z } from 'zod';
import { testCaseListResponseSchema } from './test-case.js';
import {
  resultStatusResponseSchema,
  runMemberResponseSchema,
  testRunDetailParamsSchema,
  testRunSummarySchema,
} from './test-run.js';

export const runProgressParamsSchema = testRunDetailParamsSchema;

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

export type RunProgressParams = z.infer<typeof runProgressParamsSchema>;
export type RunProgressStatus = z.infer<typeof runProgressStatusSchema>;
export type RunProgressAssignee = z.infer<typeof runProgressAssigneeSchema>;
export type RunProgressSuite = z.infer<typeof runProgressSuiteSchema>;
export type RunProgressResponse = z.infer<typeof runProgressResponseSchema>;
