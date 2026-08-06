import {
  createIntegrationConnectionHeadersSchema,
  createJiraDataCenterConnectionRequestSchema,
  createJiraDataCenterConnectionResponseSchema,
  integrationConnectionListResponseSchema,
  integrationConnectionParamsSchema,
  issueTrackerIdentitySchema,
  jiraIssueSearchRequestSchema,
  jiraIssueSearchResponseSchema,
  jiraProjectListResponseSchema,
  updateJiraDataCenterCredentialsRequestSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class IntegrationConnectionParamsDto extends createZodDto(
  integrationConnectionParamsSchema,
) {}
export class CreateIntegrationConnectionHeadersDto extends createZodDto(
  createIntegrationConnectionHeadersSchema,
) {}
export class CreateJiraDataCenterConnectionRequestDto extends createZodDto(
  createJiraDataCenterConnectionRequestSchema,
) {}
export class CreateJiraDataCenterConnectionResponseDto extends createZodDto(
  createJiraDataCenterConnectionResponseSchema,
) {}
export class IntegrationConnectionListResponseDto extends createZodDto(
  integrationConnectionListResponseSchema,
) {}
export class IssueTrackerIdentityDto extends createZodDto(issueTrackerIdentitySchema) {}
export class JiraProjectListResponseDto extends createZodDto(jiraProjectListResponseSchema) {}
export class JiraIssueSearchRequestDto extends createZodDto(jiraIssueSearchRequestSchema) {}
export class JiraIssueSearchResponseDto extends createZodDto(jiraIssueSearchResponseSchema) {}
export class UpdateJiraDataCenterCredentialsRequestDto extends createZodDto(
  updateJiraDataCenterCredentialsRequestSchema,
) {}
