import { Inject, Injectable } from '@nestjs/common';
import {
  issueLinkListResponseSchema,
  issueLinkResponseSchema,
  type IssueLinkListResponse,
  type IssueLinkResponse,
  type LinkJiraIssueRequest,
  type OrganizationAccessPrincipal,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import type { IssueLinkResult, LinkIssueSnapshot } from '../../domain/models/issue-link';
import { IssueLinkRepository } from '../../infrastructure/repositories/issue-link.repository';
import { throwIssueTrackerDomainError } from '../errors/issue-tracker-domain-error';
import { IssueTrackerClientService } from './issue-tracker-client.service';

export type ResultIssueRoute = {
  projectSlug: string;
  runId: string;
  itemId: string;
  resultId: string;
};

@Injectable()
export class IssueLinkService {
  constructor(
    @Inject(IssueLinkRepository) private readonly links: IssueLinkRepository,
    @Inject(IssueTrackerClientService) private readonly issueTracker: IssueTrackerClientService,
  ) {}

  async linkCaseIssue(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    caseId: string,
    request: LinkJiraIssueRequest,
  ): Promise<IssueLinkResponse> {
    this.assertWrite(principal);
    this.value(await this.links.listForCase(principal.organizationId, projectSlug, caseId));
    const issue = await this.remoteIssue(principal.organizationId, request);
    const result = await this.links.createForCase(
      principal.organizationId,
      principal.sub,
      projectSlug,
      caseId,
      request.connectionId,
      issue,
    );
    return issueLinkResponseSchema.parse({ link: this.value(result) });
  }

  async listCaseIssues(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    caseId: string,
  ): Promise<IssueLinkListResponse> {
    return issueLinkListResponseSchema.parse({
      links: this.value(
        await this.links.listForCase(principal.organizationId, projectSlug, caseId),
      ),
    });
  }

  async unlinkCaseIssue(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    caseId: string,
    linkId: string,
  ): Promise<void> {
    this.assertWrite(principal);
    this.value(
      await this.links.deleteForCase(principal.organizationId, projectSlug, caseId, linkId),
    );
  }

  async linkResultIssue(
    principal: OrganizationAccessPrincipal,
    route: ResultIssueRoute,
    request: LinkJiraIssueRequest,
  ): Promise<IssueLinkResponse> {
    this.assertWrite(principal);
    this.value(await this.listResultLinks(principal.organizationId, route));
    const issue = await this.remoteIssue(principal.organizationId, request);
    const result = await this.links.createForResult(
      principal.organizationId,
      principal.sub,
      route.projectSlug,
      route.runId,
      route.itemId,
      route.resultId,
      request.connectionId,
      issue,
    );
    return issueLinkResponseSchema.parse({ link: this.value(result) });
  }

  async listResultIssues(
    principal: OrganizationAccessPrincipal,
    route: ResultIssueRoute,
  ): Promise<IssueLinkListResponse> {
    return issueLinkListResponseSchema.parse({
      links: this.value(await this.listResultLinks(principal.organizationId, route)),
    });
  }

  async unlinkResultIssue(
    principal: OrganizationAccessPrincipal,
    route: ResultIssueRoute,
    linkId: string,
  ): Promise<void> {
    this.assertWrite(principal);
    this.value(
      await this.links.deleteForResult(
        principal.organizationId,
        route.projectSlug,
        route.runId,
        route.itemId,
        route.resultId,
        linkId,
      ),
    );
  }

  private listResultLinks(organizationId: string, route: ResultIssueRoute) {
    return this.links.listForResult(
      organizationId,
      route.projectSlug,
      route.runId,
      route.itemId,
      route.resultId,
    );
  }

  private async remoteIssue(
    organizationId: string,
    request: LinkJiraIssueRequest,
  ): Promise<LinkIssueSnapshot> {
    try {
      const issue = await this.issueTracker.getIssue(
        organizationId,
        request.connectionId,
        request.issueKey,
      );
      return {
        id: issue.id,
        key: issue.key,
        title: issue.summary,
        url: issue.url,
        issueType: issue.issueType.name,
        status: issue.status,
      };
    } catch (error) {
      throwIssueTrackerDomainError(error);
    }
  }

  private value<T>(result: IssueLinkResult<T>): T {
    if (result.kind === 'found') return result.value;
    const resources = {
      project_not_found: 'project',
      case_not_found: 'test_case',
      run_not_found: 'test_run',
      item_not_found: 'test_run_item',
      result_not_found: 'test_result',
      connection_not_found: 'integration_connection',
      link_not_found: 'issue_link',
    } as const;
    throw new ResourceNotFoundError(resources[result.kind]);
  }

  private assertWrite(principal: OrganizationAccessPrincipal): void {
    if (principal.tokenType !== 'organization' || principal.role === 'read_only') {
      throw new AuthorizationDeniedError();
    }
  }
}
