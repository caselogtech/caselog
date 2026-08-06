import { Inject, Injectable } from '@nestjs/common';
import type { IssueLink } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type { IssueLinkResult, LinkIssueSnapshot } from '../../domain/models/issue-link';
import { issueLinkSelection, toIssueLink } from '../persistence/issue-link.persistence';
import {
  findCaseTarget,
  findResultTarget,
  jiraConnectionExists,
} from '../persistence/issue-link-target.persistence';

@Injectable()
export class IssueLinkRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  createForCase(
    organizationId: string,
    createdById: string,
    projectSlug: string,
    caseId: string,
    connectionId: string,
    issue: LinkIssueSnapshot,
  ): Promise<IssueLinkResult<IssueLink>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const target = await findCaseTarget(transaction, organizationId, projectSlug, caseId);
      if (target.kind !== 'found') return target;
      if (!(await jiraConnectionExists(transaction, organizationId, connectionId))) {
        return { kind: 'connection_not_found' };
      }
      const existing = await transaction.issueLink.findFirst({
        where: {
          organizationId,
          connectionId,
          testCaseId: caseId,
          externalIssueId: issue.id,
          deletedAt: null,
        },
        select: issueLinkSelection,
      });
      if (existing) return { kind: 'found', value: toIssueLink(existing) };
      const created = await transaction.issueLink.create({
        data: {
          organizationId,
          projectId: target.value.projectId,
          connectionId,
          linkType: 'requirement',
          testCaseId: caseId,
          createdById,
          ...this.issueData(issue),
        },
        select: issueLinkSelection,
      });
      return { kind: 'found', value: toIssueLink(created) };
    });
  }

  createForResult(
    organizationId: string,
    createdById: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    resultId: string,
    connectionId: string,
    issue: LinkIssueSnapshot,
  ): Promise<IssueLinkResult<IssueLink>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const target = await findResultTarget(
        transaction,
        organizationId,
        projectSlug,
        runId,
        itemId,
        resultId,
      );
      if (target.kind !== 'found') return target;
      if (!(await jiraConnectionExists(transaction, organizationId, connectionId))) {
        return { kind: 'connection_not_found' };
      }
      const existing = await transaction.issueLink.findFirst({
        where: {
          organizationId,
          connectionId,
          testResultId: resultId,
          testResultExecutedAt: target.value.resultExecutedAt,
          externalIssueId: issue.id,
          deletedAt: null,
        },
        select: issueLinkSelection,
      });
      if (existing) return { kind: 'found', value: toIssueLink(existing) };
      const created = await transaction.issueLink.create({
        data: {
          organizationId,
          projectId: target.value.projectId,
          connectionId,
          linkType: 'defect',
          testResultId: resultId,
          testResultExecutedAt: target.value.resultExecutedAt,
          createdById,
          ...this.issueData(issue),
        },
        select: issueLinkSelection,
      });
      return { kind: 'found', value: toIssueLink(created) };
    });
  }

  listForCase(
    organizationId: string,
    projectSlug: string,
    caseId: string,
  ): Promise<IssueLinkResult<IssueLink[]>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const target = await findCaseTarget(transaction, organizationId, projectSlug, caseId);
      if (target.kind !== 'found') return target;
      const links = await transaction.issueLink.findMany({
        where: { organizationId, testCaseId: caseId, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: issueLinkSelection,
      });
      return { kind: 'found', value: links.map(toIssueLink) };
    });
  }

  listForResult(
    organizationId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    resultId: string,
  ): Promise<IssueLinkResult<IssueLink[]>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const target = await findResultTarget(
        transaction,
        organizationId,
        projectSlug,
        runId,
        itemId,
        resultId,
      );
      if (target.kind !== 'found') return target;
      const links = await transaction.issueLink.findMany({
        where: {
          organizationId,
          testResultId: resultId,
          testResultExecutedAt: target.value.resultExecutedAt,
          deletedAt: null,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: issueLinkSelection,
      });
      return { kind: 'found', value: links.map(toIssueLink) };
    });
  }

  deleteForCase(
    organizationId: string,
    projectSlug: string,
    caseId: string,
    linkId: string,
  ): Promise<IssueLinkResult<void>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const target = await findCaseTarget(transaction, organizationId, projectSlug, caseId);
      if (target.kind !== 'found') return target;
      const deleted = await transaction.issueLink.updateMany({
        where: { organizationId, id: linkId, testCaseId: caseId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return deleted.count === 1 ? { kind: 'found', value: undefined } : { kind: 'link_not_found' };
    });
  }

  deleteForResult(
    organizationId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    resultId: string,
    linkId: string,
  ): Promise<IssueLinkResult<void>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const target = await findResultTarget(
        transaction,
        organizationId,
        projectSlug,
        runId,
        itemId,
        resultId,
      );
      if (target.kind !== 'found') return target;
      const deleted = await transaction.issueLink.updateMany({
        where: {
          organizationId,
          id: linkId,
          testResultId: resultId,
          testResultExecutedAt: target.value.resultExecutedAt,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });
      return deleted.count === 1 ? { kind: 'found', value: undefined } : { kind: 'link_not_found' };
    });
  }

  private issueData(issue: LinkIssueSnapshot) {
    return {
      externalIssueId: issue.id,
      externalIssueKey: issue.key,
      title: issue.title,
      url: issue.url,
      issueType: issue.issueType,
      statusId: issue.status?.id,
      statusName: issue.status?.name,
      lastSyncedAt: new Date(),
    };
  }
}
