import { z } from 'zod';

export const integrationConnectionIdSchema = z.uuid();

export const integrationConnectionParamsSchema = z.object({
  connectionId: integrationConnectionIdSchema,
});

export const createJiraDataCenterConnectionRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  baseUrl: z.url().max(2_048),
  personalAccessToken: z.string().trim().min(1).max(4_096),
});

export const updateJiraDataCenterCredentialsRequestSchema = z.object({
  personalAccessToken: z.string().trim().min(1).max(4_096),
});

export const createIntegrationConnectionHeadersSchema = z.object({
  'idempotency-key': z.string().trim().min(1).max(200),
});

export const integrationConnectionSchema = z.object({
  id: integrationConnectionIdSchema,
  provider: z.literal('jira'),
  deployment: z.literal('data_center'),
  name: z.string().min(1).max(120),
  baseUrl: z.url(),
  authType: z.literal('pat'),
  status: z.enum(['active', 'error', 'disabled']),
  verifiedAt: z.iso.datetime().nullable(),
  lastSyncedAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const issueTrackerIdentitySchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
});

export const createJiraDataCenterConnectionResponseSchema = z.object({
  connection: integrationConnectionSchema,
  identity: issueTrackerIdentitySchema,
});

export const integrationConnectionListResponseSchema = z.object({
  connections: z.array(integrationConnectionSchema),
});

export const jiraProjectSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  projectType: z.string().nullable(),
});

export const jiraProjectListResponseSchema = z.object({
  projects: z.array(jiraProjectSchema),
});

export const jiraIssueSearchRequestSchema = z.object({
  jql: z.string().trim().min(1).max(10_000),
  startAt: z.number().int().nonnegative().default(0),
  maxResults: z.number().int().min(1).max(100).default(50),
});

export const jiraIssueSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  summary: z.string(),
  url: z.url(),
  status: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  issueType: z.object({ id: z.string().min(1), name: z.string().min(1) }),
});

export const jiraIssueSearchResponseSchema = z.object({
  startAt: z.number().int().nonnegative(),
  maxResults: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  issues: z.array(jiraIssueSchema),
});

export const issueLinkSchema = z.object({
  id: z.uuid(),
  connectionId: integrationConnectionIdSchema,
  linkType: z.enum(['requirement', 'defect']),
  externalIssueId: z.string().min(1).max(255),
  externalIssueKey: z.string().min(1).max(255),
  title: z.string().max(500),
  url: z.url(),
  issueType: z.string().min(1).max(120),
  status: z.object({ id: z.string().min(1), name: z.string().min(1) }).nullable(),
  lastSyncedAt: z.iso.datetime().nullable(),
  lastSyncAttemptAt: z.iso.datetime().nullable(),
  syncError: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const issueLinkResponseSchema = z.object({ link: issueLinkSchema });
export const issueLinkListResponseSchema = z.object({ links: z.array(issueLinkSchema) });

export const linkJiraIssueRequestSchema = z.object({
  connectionId: integrationConnectionIdSchema,
  issueKey: z.string().trim().min(1).max(255),
});

export const caseIssueLinkParamsSchema = z.object({
  projectSlug: z.string().min(1).max(50),
  caseId: z.uuid(),
});

export const resultIssueLinkParamsSchema = z.object({
  projectSlug: z.string().min(1).max(50),
  runId: z.uuid(),
  itemId: z.uuid(),
  resultId: z.uuid(),
});

export const issueLinkItemParamsSchema = z.object({ linkId: z.uuid() });
export const caseIssueLinkItemParamsSchema = caseIssueLinkParamsSchema.extend({ linkId: z.uuid() });
export const resultIssueLinkItemParamsSchema = resultIssueLinkParamsSchema.extend({
  linkId: z.uuid(),
});

export const createDefectHeadersSchema = createIntegrationConnectionHeadersSchema;

export const createJiraDefectRequestSchema = z
  .object({
    connectionId: integrationConnectionIdSchema,
    jiraProjectKey: z.string().trim().min(1).max(255),
    issueType: z.string().trim().min(1).max(120).default('Bug'),
    summary: z.string().trim().min(1).max(255).optional(),
    environment: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().max(10_000).optional(),
    attachmentIds: z.array(z.uuid()).max(10).default([]),
  })
  .superRefine(({ attachmentIds }, context) => {
    if (new Set(attachmentIds).size !== attachmentIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['attachmentIds'],
        message: 'Attachment IDs must be unique',
      });
    }
  });

export const createJiraDefectResponseSchema = z.object({
  link: issueLinkSchema,
  attachmentWarnings: z.array(z.string()),
});

export type CreateJiraDataCenterConnectionRequest = z.infer<
  typeof createJiraDataCenterConnectionRequestSchema
>;
export type CreateJiraDataCenterConnectionResponse = z.infer<
  typeof createJiraDataCenterConnectionResponseSchema
>;
export type UpdateJiraDataCenterCredentialsRequest = z.infer<
  typeof updateJiraDataCenterCredentialsRequestSchema
>;
export type IntegrationConnection = z.infer<typeof integrationConnectionSchema>;
export type IntegrationConnectionListResponse = z.infer<
  typeof integrationConnectionListResponseSchema
>;
export type IssueTrackerIdentity = z.infer<typeof issueTrackerIdentitySchema>;
export type JiraProject = z.infer<typeof jiraProjectSchema>;
export type JiraProjectListResponse = z.infer<typeof jiraProjectListResponseSchema>;
export type JiraIssueSearchRequest = z.infer<typeof jiraIssueSearchRequestSchema>;
export type JiraIssue = z.infer<typeof jiraIssueSchema>;
export type JiraIssueSearchResponse = z.infer<typeof jiraIssueSearchResponseSchema>;
export type IssueLink = z.infer<typeof issueLinkSchema>;
export type IssueLinkResponse = z.infer<typeof issueLinkResponseSchema>;
export type IssueLinkListResponse = z.infer<typeof issueLinkListResponseSchema>;
export type LinkJiraIssueRequest = z.infer<typeof linkJiraIssueRequestSchema>;
export type CreateJiraDefectRequest = z.infer<typeof createJiraDefectRequestSchema>;
export type CreateJiraDefectResponse = z.infer<typeof createJiraDefectResponseSchema>;
