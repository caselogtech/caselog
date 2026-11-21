import { z } from 'zod';
import { projectSlugSchema } from './project.js';
import {
  qualityMetricKeySchema,
  qualityMetricDimensionsSchema,
  validateMetricDimensions,
  QUALITY_METRIC_DEFINITIONS,
} from './quality-metric.js';

export const evidenceMetricKeySchema = qualityMetricKeySchema;
export const evidenceObservationStateSchema = z.enum(['available', 'incomplete']);
export const evidenceTrustLevelSchema = z.enum(['verified', 'authenticated', 'unverified']);
export const evidenceFreshnessSchema = z.enum(['current', 'stale']);
export const evidenceProcessingIssueCodeSchema = z.enum([
  'test_run_unavailable',
  'invalid_source_data',
  'native_materialization_failed',
]);
export const evidenceIdempotencyKeySchema = z
  .string()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const evidenceProjectParamsSchema = z.object({ projectSlug: projectSlugSchema });
export const evidenceListQuerySchema = z
  .object({
    candidateId: z.uuid(),
    metricKey: evidenceMetricKeySchema.optional(),
    producerKey: z.string().trim().min(1).max(120).optional(),
    sourceType: z.string().trim().min(1).max(80).optional(),
    trust: evidenceTrustLevelSchema.optional(),
    freshness: evidenceFreshnessSchema.optional(),
    state: evidenceObservationStateSchema.optional(),
    observedAfter: z.iso.datetime().optional(),
    observedBefore: z.iso.datetime().optional(),
    currentOnly: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .superRefine((query, context) => {
    if (
      query.observedAfter &&
      query.observedBefore &&
      new Date(query.observedAfter) > new Date(query.observedBefore)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['observedBefore'],
        message: 'Observed-before must not precede observed-after',
      });
    }
  });

export const evidenceValueSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('percentage'),
    value: z
      .string()
      .regex(/^\d{1,3}(?:\.\d{1,9})?$/)
      .refine((value) => Number(value) <= 100, { message: 'Percentage cannot exceed 100' })
      .nullable(),
  }),
  z.object({ type: z.literal('integer'), value: z.number().int().nullable() }),
]);

export const nativeTestEvidenceDetailsSchema = z.object({
  scopeCapturedAt: z.iso.datetime().optional(),
  scopeHash: z.string().optional(),
  requiredCaseCount: z.number().int().nonnegative().optional(),
  missingCaseCount: z.number().int().nonnegative().optional(),
  missingCaseIds: z.array(z.uuid()).max(100).optional(),
  missingCaseIdsTruncated: z.boolean().optional(),
  runCount: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  finalItems: z.number().int().nonnegative(),
  executedFinalItems: z.number().int().nonnegative(),
  passedItems: z.number().int().nonnegative(),
  failedItems: z.number().int().nonnegative(),
  skippedItems: z.number().int().nonnegative(),
  incompleteRunIds: z.array(z.uuid()).max(100),
  runRevisions: z
    .array(z.object({ testRunId: z.uuid(), revision: z.number().int().nonnegative() }))
    .max(100),
  runRevisionsTruncated: z.boolean(),
});

const evidenceDetailScalarSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const externalEvidenceDetailsSchema = z
  .record(
    z.string().min(1).max(80),
    z.union([evidenceDetailScalarSchema, z.array(evidenceDetailScalarSchema).max(500)]),
  )
  .refine((value) => JSON.stringify(value).length <= 16_384, {
    message: 'Evidence details must not exceed 16384 characters',
  });

export const evidenceDetailsSchema = z.union([
  nativeTestEvidenceDetailsSchema,
  externalEvidenceDetailsSchema,
]);

export const evidenceObservationSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  candidateId: z.uuid(),
  metricKey: evidenceMetricKeySchema,
  metricVersion: z.string().min(1).max(20),
  value: evidenceValueSchema,
  state: evidenceObservationStateSchema,
  dimensions: qualityMetricDimensionsSchema,
  observedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  freshness: evidenceFreshnessSchema,
  producer: z.object({
    id: z.uuid(),
    type: z.string().min(1).max(80),
    key: z.string().min(1).max(120),
    schemaVersion: z.number().int().positive(),
    trust: evidenceTrustLevelSchema,
  }),
  source: z.object({
    type: z.string().min(1).max(80),
    id: z.string().min(1).max(200),
    revision: z.string().min(1).max(200),
    url: z.string().nullable(),
  }),
  details: evidenceDetailsSchema,
  supersedesObservationId: z.uuid().nullable(),
  isCurrent: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const evidenceProcessingIssueSchema = z.object({
  id: z.uuid(),
  stage: z.literal('ingestion'),
  code: evidenceProcessingIssueCodeSchema,
  attempts: z.number().int().positive(),
  source: z.object({
    eventId: z.uuid(),
    eventName: z.string().min(1).max(120),
    type: z.string().min(1).max(80),
    id: z.string().min(1).max(200),
    revision: z.string().min(1).max(200),
  }),
  firstFailedAt: z.iso.datetime(),
  lastFailedAt: z.iso.datetime(),
});

export const evidenceListResponseSchema = z.object({
  candidateId: z.uuid(),
  candidateRevision: z.number().int().nonnegative(),
  items: z.array(evidenceObservationSchema),
  issues: z.array(evidenceProcessingIssueSchema).default([]),
  nextCursor: z.uuid().nullable(),
});

export const evidenceIngestHeadersSchema = z.object({
  'idempotency-key': evidenceIdempotencyKeySchema,
});

export const evidenceIngestRequestSchema = z
  .object({
    candidateId: z.uuid(),
    metricKey: evidenceMetricKeySchema,
    metricVersion: z.literal('1.0.0'),
    value: evidenceValueSchema,
    state: evidenceObservationStateSchema,
    dimensions: qualityMetricDimensionsSchema,
    observedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    source: z
      .object({
        type: z.string().trim().min(1).max(80),
        id: z.string().trim().min(1).max(200),
        revision: z.string().trim().min(1).max(200),
        url: z.string().url().max(2048).nullable().default(null),
      })
      .strict(),
    details: externalEvidenceDetailsSchema.default({}),
    supersedesObservationId: z.uuid().nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    validateMetricDimensions(value.metricKey, value.dimensions, context);
    if (value.dimensions.minimumPriority)
      context.addIssue({
        code: 'custom',
        path: ['dimensions', 'minimumPriority'],
        message: 'Priority-scoped test evidence is produced by Caselog',
      });
    if (value.value.type !== QUALITY_METRIC_DEFINITIONS[value.metricKey].valueType)
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Evidence value type does not match its metric',
      });
    if (!value.metricKey.startsWith('test.') && !value.source.url)
      context.addIssue({
        code: 'custom',
        path: ['source', 'url'],
        message: 'External quality evidence requires a report URL',
      });
    if (
      value.metricKey === 'accessibility.wcag22_aa_manual_review' &&
      value.value.type === 'integer' &&
      value.value.value !== null &&
      ![0, 1].includes(value.value.value)
    )
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Manual review is 1 (passed) or 0 (failed)',
      });
    if (value.metricKey === 'performance.lighthouse_score' && value.state === 'available') {
      // biome-ignore lint/complexity/useLiteralKeys: Angular requires indexed access for record fields.
      const samples = value.details['performanceSamples'];
      const runs = value.dimensions.runsPerPage ?? 0;
      const pages = value.dimensions.pageUrls?.length ?? 0;
      if (
        !Array.isArray(samples) ||
        runs === 0 ||
        samples.length !== runs * pages ||
        samples.some(
          (sample) =>
            typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0 || sample > 100,
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['details', 'performanceSamples'],
          message: 'Provide 3–10 scores per page, ordered by the sorted page URLs',
        });
      } else {
        const numbers = samples.filter((sample): sample is number => typeof sample === 'number');
        const medians = Array.from({ length: pages }, (_, page) => {
          const group = numbers.slice(page * runs, (page + 1) * runs).sort((a, b) => a - b);
          return (
            ((group[Math.floor((runs - 1) / 2)] ?? 0) + (group[Math.floor(runs / 2)] ?? 0)) / 2
          );
        });
        if (
          value.value.type !== 'percentage' ||
          Math.abs(Number(value.value.value) - Math.min(...medians)) > 0.000000001
        )
          context.addIssue({
            code: 'custom',
            path: ['value'],
            message: 'Lighthouse score must equal the minimum of the per-page medians',
          });
      }
    }
    if (value.state === 'available' && value.value.value === null) {
      context.addIssue({
        code: 'custom',
        path: ['value', 'value'],
        message: 'Available evidence requires a value',
      });
    }
    if (new Date(value.expiresAt) <= new Date(value.observedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Evidence expiry must be later than its observation time',
      });
    }
  });

export const evidenceIngestResponseSchema = z.object({
  observation: evidenceObservationSchema,
  candidateRevision: z.number().int().nonnegative(),
  replayed: z.boolean(),
});

export type EvidenceMetricKey = z.infer<typeof evidenceMetricKeySchema>;
export type EvidenceListQuery = z.infer<typeof evidenceListQuerySchema>;
export type EvidenceObservation = z.infer<typeof evidenceObservationSchema>;
export type EvidenceProcessingIssue = z.infer<typeof evidenceProcessingIssueSchema>;
export type EvidenceProcessingIssueCode = z.infer<typeof evidenceProcessingIssueCodeSchema>;
export type EvidenceListResponse = z.infer<typeof evidenceListResponseSchema>;
export type EvidenceIngestRequest = z.infer<typeof evidenceIngestRequestSchema>;
export type EvidenceIngestResponse = z.infer<typeof evidenceIngestResponseSchema>;
