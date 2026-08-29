import { z } from 'zod';
import { idempotencyHeadersSchema } from './test-run.js';
import { projectSlugSchema } from './project.js';

export const environmentStateSchema = z.enum(['active', 'archived']);
export const releaseStateSchema = z.enum(['draft', 'active', 'released', 'cancelled']);
export const candidateTestRunRoleSchema = z.enum(['required', 'informational']);

export const releaseProjectParamsSchema = z.object({ projectSlug: projectSlugSchema });
export const environmentParamsSchema = releaseProjectParamsSchema.extend({
  environmentId: z.uuid(),
});
export const releaseParamsSchema = releaseProjectParamsSchema.extend({ releaseId: z.uuid() });
export const releaseCandidateParamsSchema = releaseProjectParamsSchema.extend({
  candidateId: z.uuid(),
});
export const candidateTestRunParamsSchema = releaseCandidateParamsSchema.extend({
  runId: z.uuid(),
});

export const releaseListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  state: releaseStateSchema.optional(),
});

export const environmentSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(50),
  description: z.string().nullable(),
  state: environmentStateSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const environmentSettingsSummarySchema = environmentSummarySchema.extend({
  activeReleaseCount: z.number().int().nonnegative(),
});
export const environmentListResponseSchema = z.object({
  items: z.array(environmentSettingsSummarySchema),
});
export const createEnvironmentRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z
    .union([z.string().trim().max(2_000), z.literal('')])
    .optional()
    .transform((value) => value || undefined),
});
export const createEnvironmentResponseSchema = z.object({ environment: environmentSummarySchema });
export const updateEnvironmentRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2_000).nullable(),
});
export const updateEnvironmentResponseSchema = z.object({
  environment: environmentSettingsSummarySchema,
});
export const environmentLifecycleResponseSchema = z.object({
  environmentId: z.uuid(),
  state: environmentStateSchema,
});

export const releaseEnvironmentSchema = environmentSummarySchema.pick({
  id: true,
  name: true,
  slug: true,
  state: true,
});
export const releaseSummarySchema = z.object({
  id: z.uuid(),
  key: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  state: releaseStateSchema,
  environment: releaseEnvironmentSchema.nullable(),
  targetDate: z.iso.datetime().nullable(),
  externalReference: z.string().nullable(),
  candidateCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  activatedAt: z.iso.datetime().nullable(),
  releasedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
});
export const releaseListResponseSchema = z.object({
  items: z.array(releaseSummarySchema),
  nextCursor: z.uuid().nullable(),
});
export const createReleaseRequestSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  name: z.string().trim().min(1).max(200),
  environmentId: z.uuid().optional(),
  targetDate: z.iso.datetime().optional(),
  externalReference: z
    .union([z.string().trim().min(1).max(2_048), z.literal('')])
    .optional()
    .transform((value) => value || undefined),
});
export const createReleaseResponseSchema = z.object({ release: releaseSummarySchema });
export const releaseLifecycleResponseSchema = z.object({
  releaseId: z.uuid(),
  state: releaseStateSchema,
  updatedAt: z.iso.datetime(),
});

export const candidateTestRunSchema = z.object({
  testRunId: z.uuid(),
  name: z.string().min(1).max(200),
  status: z.enum(['draft', 'active', 'completed', 'archived']),
  role: candidateTestRunRoleSchema,
  linkedAt: z.iso.datetime(),
});
export const releaseCandidateSchema = z.object({
  id: z.uuid(),
  sequence: z.number().int().positive(),
  label: z.string().regex(/^RC-[1-9]\d*$/),
  sourceRevision: z.string().nullable(),
  buildIdentifier: z.string().nullable(),
  artifactDigest: z.string().nullable(),
  branch: z.string().nullable(),
  version: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  testRuns: z.array(candidateTestRunSchema),
});
export const releaseCandidateListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const createReleaseCandidateRequestSchema = z
  .object({
    sourceRevision: z
      .union([z.string().trim().min(1).max(255), z.literal('')])
      .optional()
      .transform((value) => value || undefined),
    buildIdentifier: z
      .union([z.string().trim().min(1).max(255), z.literal('')])
      .optional()
      .transform((value) => value || undefined),
    artifactDigest: z
      .union([z.string().trim().min(1).max(255), z.literal('')])
      .optional()
      .transform((value) => value || undefined),
    branch: z
      .union([z.string().trim().min(1).max(255), z.literal('')])
      .optional()
      .transform((value) => value || undefined),
    version: z
      .union([z.string().trim().min(1).max(120), z.literal('')])
      .optional()
      .transform((value) => value || undefined),
    sourceUrl: z.url().max(2_048).optional(),
  })
  .refine(
    ({ sourceRevision, buildIdentifier, artifactDigest }) =>
      Boolean(sourceRevision || buildIdentifier || artifactDigest),
    {
      message: 'A source revision, build identifier, or artifact digest is required',
      path: ['sourceRevision'],
    },
  );
export const createReleaseCandidateResponseSchema = z.object({ candidate: releaseCandidateSchema });
export const releaseCandidateListResponseSchema = z.object({
  items: z.array(releaseCandidateSchema),
  nextCursor: z.uuid().nullable(),
});
export const linkCandidateTestRunRequestSchema = z.object({
  role: candidateTestRunRoleSchema.default('required'),
});
export const candidateTestRunResponseSchema = z.object({ link: candidateTestRunSchema });
export const candidateTestRunListResponseSchema = z.object({
  items: z.array(candidateTestRunSchema),
});

export const releaseHistoryEventSchema = z.object({
  id: z.uuid(),
  fromState: releaseStateSchema.nullable(),
  toState: releaseStateSchema,
  occurredAt: z.iso.datetime(),
});
export const releaseDetailResponseSchema = z.object({
  release: releaseSummarySchema,
  candidates: z.array(releaseCandidateSchema),
  history: z.array(releaseHistoryEventSchema),
});

export const createReleaseHeadersSchema = idempotencyHeadersSchema;
export const createEnvironmentHeadersSchema = idempotencyHeadersSchema;
export const createReleaseCandidateHeadersSchema = idempotencyHeadersSchema;

export type EnvironmentState = z.infer<typeof environmentStateSchema>;
export type ReleaseState = z.infer<typeof releaseStateSchema>;
export type CandidateTestRunRole = z.infer<typeof candidateTestRunRoleSchema>;
export type ReleaseListQuery = z.infer<typeof releaseListQuerySchema>;
export type EnvironmentSummary = z.infer<typeof environmentSummarySchema>;
export type EnvironmentSettingsSummary = z.infer<typeof environmentSettingsSummarySchema>;
export type EnvironmentListResponse = z.infer<typeof environmentListResponseSchema>;
export type CreateEnvironmentRequest = z.infer<typeof createEnvironmentRequestSchema>;
export type CreateEnvironmentResponse = z.infer<typeof createEnvironmentResponseSchema>;
export type UpdateEnvironmentRequest = z.infer<typeof updateEnvironmentRequestSchema>;
export type UpdateEnvironmentResponse = z.infer<typeof updateEnvironmentResponseSchema>;
export type EnvironmentLifecycleResponse = z.infer<typeof environmentLifecycleResponseSchema>;
export type ReleaseSummary = z.infer<typeof releaseSummarySchema>;
export type ReleaseListResponse = z.infer<typeof releaseListResponseSchema>;
export type CreateReleaseRequest = z.infer<typeof createReleaseRequestSchema>;
export type CreateReleaseResponse = z.infer<typeof createReleaseResponseSchema>;
export type ReleaseLifecycleResponse = z.infer<typeof releaseLifecycleResponseSchema>;
export type ReleaseCandidate = z.infer<typeof releaseCandidateSchema>;
export type ReleaseCandidateListQuery = z.infer<typeof releaseCandidateListQuerySchema>;
export type CreateReleaseCandidateRequest = z.infer<typeof createReleaseCandidateRequestSchema>;
export type CreateReleaseCandidateResponse = z.infer<typeof createReleaseCandidateResponseSchema>;
export type ReleaseCandidateListResponse = z.infer<typeof releaseCandidateListResponseSchema>;
export type LinkCandidateTestRunRequest = z.infer<typeof linkCandidateTestRunRequestSchema>;
export type CandidateTestRun = z.infer<typeof candidateTestRunSchema>;
export type CandidateTestRunResponse = z.infer<typeof candidateTestRunResponseSchema>;
export type CandidateTestRunListResponse = z.infer<typeof candidateTestRunListResponseSchema>;
export type ReleaseDetailResponse = z.infer<typeof releaseDetailResponseSchema>;
