import { Inject, Injectable } from '@nestjs/common';
import {
  jiraIssueSearchResponseSchema,
  jiraProjectListResponseSchema,
  type JiraIssueSearchRequest,
  type JiraIssueSearchResponse,
  type JiraProjectListResponse,
  type OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { throwIssueTrackerDomainError } from '../errors/issue-tracker-domain-error';
import { IssueTrackerClientService } from './issue-tracker-client.service';

@Injectable()
export class IssueTrackerQueryService {
  constructor(
    @Inject(IssueTrackerClientService)
    private readonly issueTracker: IssueTrackerClientService,
  ) {}

  async listProjects(
    principal: OrganizationAccessPrincipal,
    connectionId: string,
  ): Promise<JiraProjectListResponse> {
    try {
      return jiraProjectListResponseSchema.parse({
        projects: await this.issueTracker.listProjects(principal.organizationId, connectionId),
      });
    } catch (error) {
      throwIssueTrackerDomainError(error);
    }
  }

  async searchIssues(
    principal: OrganizationAccessPrincipal,
    connectionId: string,
    request: JiraIssueSearchRequest,
  ): Promise<JiraIssueSearchResponse> {
    try {
      return jiraIssueSearchResponseSchema.parse(
        await this.issueTracker.searchIssues(principal.organizationId, connectionId, request),
      );
    } catch (error) {
      throwIssueTrackerDomainError(error);
    }
  }
}
