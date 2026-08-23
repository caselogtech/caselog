import { z } from 'zod';
import {
  testCaseContentSchema,
  testCaseListParamsSchema,
  testCaseListResponseSchema,
  testCaseTemplateSchema,
} from './test-case.js';

export const testRunStatusSchema = z.enum(['draft', 'active', 'completed', 'archived']);
export const createTestRunStatusSchema = z.enum(['draft', 'active']);
export const idempotencyKeySchema = z.string().trim().min(1).max(200);
export const idempotencyHeadersSchema = z.object({
  'idempotency-key': idempotencyKeySchema,
});
export const createTestRunHeadersSchema = idempotencyHeadersSchema;
const ingestionMetadataValueSchema = (max: number) => z.string().trim().min(1).max(max).optional();
export const junitUploadMetadataSchema = z.object({
  source: ingestionMetadataValueSchema(120),
  pipeline: ingestionMetadataValueSchema(200),
  branch: ingestionMetadataValueSchema(255),
});
export const junitUploadHeadersSchema = idempotencyHeadersSchema.extend({
  'x-caselog-source': junitUploadMetadataSchema.shape.source,
  'x-caselog-pipeline': junitUploadMetadataSchema.shape.pipeline,
  'x-caselog-branch': junitUploadMetadataSchema.shape.branch,
});

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
    status: createTestRunStatusSchema.default('active'),
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

export const createStepResultRequestSchema = z.object({
  position: z.number().int().nonnegative().max(199),
  statusId: z.uuid(),
  comment: z.string().trim().max(10_000).optional(),
  elapsedMs: z.number().int().nonnegative().max(86_400_000).optional(),
});

export const createTestResultRequestSchema = z
  .object({
    statusId: z.uuid(),
    comment: z.string().trim().max(50_000).optional(),
    elapsedMs: z.number().int().nonnegative().max(86_400_000).optional(),
    stepResults: z.array(createStepResultRequestSchema).max(200).optional(),
    uploadIds: z.array(z.uuid()).max(20).optional(),
  })
  .superRefine(({ stepResults, uploadIds }, context) => {
    if (
      stepResults &&
      new Set(stepResults.map(({ position }) => position)).size !== stepResults.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['stepResults'],
        message: 'Step positions must be unique',
      });
    }
    if (uploadIds && new Set(uploadIds).size !== uploadIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['uploadIds'],
        message: 'Upload IDs must be unique',
      });
    }
  });

export const stepResultResponseSchema = z.object({
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  status: resultStatusResponseSchema,
  comment: z.string().nullable(),
  elapsedMs: z.number().int().nonnegative().nullable(),
});

export const resultAttachmentResponseSchema = z.object({
  id: z.uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
  stepPosition: z.number().int().nonnegative().nullable(),
});

export const testResultResponseSchema = z.object({
  id: z.uuid(),
  attempt: z.number().int().positive(),
  status: resultStatusResponseSchema,
  comment: z.string().nullable(),
  elapsedMs: z.number().int().nonnegative().nullable(),
  executedBy: runMemberResponseSchema.nullable(),
  executedAt: z.iso.datetime(),
  stepResults: z.array(stepResultResponseSchema),
  attachments: z.array(resultAttachmentResponseSchema),
});

export const createTestResultResponseSchema = z.object({ result: testResultResponseSchema });

export const bulkTestResultItemRequestSchema = z
  .object({
    itemId: z.uuid().optional(),
    automationId: z.string().trim().min(1).max(500).optional(),
    caseNumber: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional(),
    statusId: z.uuid(),
    comment: z.string().trim().max(50_000).optional(),
    elapsedMs: z.number().int().nonnegative().max(86_400_000).optional(),
  })
  .superRefine(({ itemId, automationId, caseNumber }, context) => {
    if (!itemId && !automationId && !caseNumber) {
      context.addIssue({
        code: 'custom',
        path: ['itemId'],
        message: 'A run item ID, automation ID, or case number is required',
      });
    }
    if (itemId && (automationId || caseNumber)) {
      context.addIssue({
        code: 'custom',
        path: ['itemId'],
        message: 'A run item ID cannot be combined with external identifiers',
      });
    }
  });

export const bulkTestResultsRequestSchema = z
  .object({ results: z.array(bulkTestResultItemRequestSchema).min(1).max(1_000) })
  .superRefine(({ results }, context) => {
    const seen = new Set<string>();
    for (const [index, result] of results.entries()) {
      if (!result.itemId) continue;
      if (seen.has(result.itemId)) {
        context.addIssue({
          code: 'custom',
          path: ['results', index, 'itemId'],
          message: 'Run items must be unique within a bulk request',
        });
      }
      seen.add(result.itemId);
    }
  });

export const bulkTestResultItemResponseSchema = z.object({
  itemId: z.uuid(),
  resultId: z.uuid(),
  attempt: z.number().int().positive(),
  status: resultStatusResponseSchema,
  executedAt: z.iso.datetime(),
});

export const unmatchedBulkTestResultSchema = z.object({
  index: z.number().int().nonnegative(),
  automationId: z.string().nullable(),
  caseNumber: z
    .string()
    .regex(/^[1-9]\d*$/)
    .nullable(),
  reason: z.enum(['not_found', 'ambiguous']),
});

export const bulkTestResultsResponseSchema = z.object({
  results: z.array(bulkTestResultItemResponseSchema),
  unmatched: z.array(unmatchedBulkTestResultSchema),
});

export const junitUploadUnmatchedResultSchema = z.object({
  sequence: z.number().int().positive(),
  name: z.string().min(1),
  automationId: z.string().min(1).max(500),
  caseNumber: z
    .string()
    .regex(/^[1-9]\d*$/)
    .nullable(),
  reason: z.enum(['not_found', 'ambiguous']),
});

export const junitUploadResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  recorded: z.number().int().nonnegative(),
  truncated: z.number().int().nonnegative(),
  counts: z.object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  unmatched: z.array(junitUploadUnmatchedResultSchema),
});

export const testResultHistoryQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const testResultParamsSchema = testRunItemParamsSchema.extend({ resultId: z.uuid() });
export const testResultHistoryResponseSchema = z.object({
  item: z.object({ id: z.uuid(), title: z.string().min(1).max(500) }),
  results: z.array(testResultResponseSchema),
  nextCursor: z.uuid().nullable(),
});
export const testResultDetailResponseSchema = z.object({
  item: testRunItemResponseSchema,
  result: testResultResponseSchema,
});

export const testRunLifecycleResponseSchema = z.object({ run: testRunSummarySchema });

export type TestRunStatus = z.infer<typeof testRunStatusSchema>;
export type TestRunListParams = z.infer<typeof testRunListParamsSchema>;
export type TestRunListQuery = z.infer<typeof testRunListQuerySchema>;
export type TestRunSummary = z.infer<typeof testRunSummarySchema>;
export type TestRunListResponse = z.infer<typeof testRunListResponseSchema>;
export type CreateTestRunRequest = z.input<typeof createTestRunRequestSchema>;
export type CreateTestRunStatus = z.infer<typeof createTestRunStatusSchema>;
export type CreateTestRunHeaders = z.infer<typeof createTestRunHeadersSchema>;
export type IdempotencyHeaders = z.infer<typeof idempotencyHeadersSchema>;
export type JUnitUploadMetadata = z.infer<typeof junitUploadMetadataSchema>;
export type JUnitUploadHeaders = z.infer<typeof junitUploadHeadersSchema>;
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
export type BulkTestResultItemRequest = z.infer<typeof bulkTestResultItemRequestSchema>;
export type BulkTestResultsRequest = z.infer<typeof bulkTestResultsRequestSchema>;
export type BulkTestResultItemResponse = z.infer<typeof bulkTestResultItemResponseSchema>;
export type UnmatchedBulkTestResult = z.infer<typeof unmatchedBulkTestResultSchema>;
export type BulkTestResultsResponse = z.infer<typeof bulkTestResultsResponseSchema>;
export type JUnitUploadUnmatchedResult = z.infer<typeof junitUploadUnmatchedResultSchema>;
export type JUnitUploadResponse = z.infer<typeof junitUploadResponseSchema>;
export type CreateStepResultRequest = z.infer<typeof createStepResultRequestSchema>;
export type StepResultResponse = z.infer<typeof stepResultResponseSchema>;
export type ResultAttachmentResponse = z.infer<typeof resultAttachmentResponseSchema>;
export type TestResultResponse = z.infer<typeof testResultResponseSchema>;
export type TestResultHistoryQuery = z.infer<typeof testResultHistoryQuerySchema>;
export type TestResultParams = z.infer<typeof testResultParamsSchema>;
export type TestResultHistoryResponse = z.infer<typeof testResultHistoryResponseSchema>;
export type TestResultDetailResponse = z.infer<typeof testResultDetailResponseSchema>;
export type TestRunLifecycleResponse = z.infer<typeof testRunLifecycleResponseSchema>;
