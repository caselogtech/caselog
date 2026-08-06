import {
  caseIssueLinkItemParamsSchema,
  caseIssueLinkParamsSchema,
  createDefectHeadersSchema,
  createIntegrationConnectionHeadersSchema,
  createJiraDataCenterConnectionRequestSchema,
  createJiraDataCenterConnectionResponseSchema,
  createJiraDefectRequestSchema,
  createJiraDefectResponseSchema,
  integrationConnectionListResponseSchema,
  integrationConnectionParamsSchema,
  issueTrackerIdentitySchema,
  issueLinkListResponseSchema,
  issueLinkResponseSchema,
  jiraIssueSearchRequestSchema,
  jiraIssueSearchResponseSchema,
  jiraProjectListResponseSchema,
  linkJiraIssueRequestSchema,
  resultIssueLinkItemParamsSchema,
  resultIssueLinkParamsSchema,
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
export class CaseIssueLinkParamsDto extends createZodDto(caseIssueLinkParamsSchema) {}
export class CaseIssueLinkItemParamsDto extends createZodDto(caseIssueLinkItemParamsSchema) {}
export class ResultIssueLinkParamsDto extends createZodDto(resultIssueLinkParamsSchema) {}
export class ResultIssueLinkItemParamsDto extends createZodDto(resultIssueLinkItemParamsSchema) {}
export class LinkJiraIssueRequestDto extends createZodDto(linkJiraIssueRequestSchema) {}
export class IssueLinkResponseDto extends createZodDto(issueLinkResponseSchema) {}
export class IssueLinkListResponseDto extends createZodDto(issueLinkListResponseSchema) {}
export class CreateJiraDefectRequestDto extends createZodDto(createJiraDefectRequestSchema) {}
export class CreateDefectHeadersDto extends createZodDto(createDefectHeadersSchema) {}
export class CreateJiraDefectResponseDto extends createZodDto(createJiraDefectResponseSchema) {}
