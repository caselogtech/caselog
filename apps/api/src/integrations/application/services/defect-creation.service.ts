import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  createJiraDefectResponseSchema,
  type CreateJiraDefectRequest,
  type CreateJiraDefectResponse,
  type OrganizationAccessPrincipal,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  PayloadTooLargeError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/application/ports/storage.provider';
import {
  buildDefectDescription,
  defaultDefectSummary,
} from '../../domain/formatters/defect-description';
import {
  ISSUE_TRACKER_CONFIG,
  type IssueTrackerConfig,
} from '../../infrastructure/config/issue-tracker.config';
import { DefectCreationRepository } from '../../infrastructure/repositories/defect-creation.repository';
import {
  issueCreationCanRetry,
  throwIssueTrackerDomainError,
} from '../errors/issue-tracker-domain-error';
import type { ResultIssueRoute } from './issue-link.service';
import { IssueTrackerClientService } from './issue-tracker-client.service';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

@Injectable()
export class DefectCreationService {
  constructor(
    @Inject(DefectCreationRepository) private readonly requests: DefectCreationRepository,
    @Inject(IssueTrackerClientService) private readonly issueTracker: IssueTrackerClientService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(ISSUE_TRACKER_CONFIG) private readonly config: IssueTrackerConfig,
  ) {}

  async create(
    principal: OrganizationAccessPrincipal,
    route: ResultIssueRoute,
    idempotencyKey: string,
    request: CreateJiraDefectRequest,
  ): Promise<CreateJiraDefectResponse> {
    this.assertWrite(principal);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ ...route, ...request }))
      .digest('hex');
    const started = await this.requests.begin(
      principal.organizationId,
      principal.sub,
      route.projectSlug,
      route.runId,
      route.itemId,
      route.resultId,
      request.connectionId,
      idempotencyKey,
      requestHash,
      request.attachmentIds,
    );
    if (started.kind === 'replayed') {
      return createJiraDefectResponseSchema.parse(started.value);
    }
    if (started.kind !== 'started') this.throwBeginError(started.kind);

    const attachments = await this.readAttachments(
      principal.organizationId,
      started.requestId,
      started.context.attachments,
    );
    let created: Awaited<ReturnType<IssueTrackerClientService['createIssue']>>;
    try {
      created = await this.issueTracker.createIssue(
        principal.organizationId,
        request.connectionId,
        {
          projectKey: request.jiraProjectKey,
          issueType: request.issueType,
          summary: request.summary ?? defaultDefectSummary(started.context),
          description: buildDefectDescription(
            started.context,
            this.config.webBaseUrl,
            request.environment,
            request.description,
          ),
          attachments,
        },
      );
    } catch (error) {
      await this.requests.markFailed(
        principal.organizationId,
        started.requestId,
        issueCreationCanRetry(error) ? 'failed' : 'reconciliation_required',
        error instanceof Error ? error.message : 'Issue creation failed',
      );
      throwIssueTrackerDomainError(error);
    }

    try {
      return createJiraDefectResponseSchema.parse(
        await this.requests.complete(
          principal.organizationId,
          started.requestId,
          {
            id: created.id,
            key: created.key,
            title: created.summary,
            url: created.url,
            issueType: created.issueType,
            status: null,
          },
          created.attachmentWarnings,
        ),
      );
    } catch (error) {
      await this.requests.markFailed(
        principal.organizationId,
        started.requestId,
        'reconciliation_required',
        'Jira created the issue, but Caselog could not store the link',
      );
      throw error;
    }
  }

  private async readAttachments(
    organizationId: string,
    requestId: string,
    attachments: Array<{ storageKey: string; fileName: string; contentType: string }>,
  ): Promise<Array<{ fileName: string; contentType: string; content: Uint8Array }>> {
    try {
      return await Promise.all(
        attachments.map(async (attachment) => ({
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          content: await this.storage.read(attachment.storageKey, MAX_ATTACHMENT_BYTES),
        })),
      );
    } catch {
      await this.requests.markFailed(
        organizationId,
        requestId,
        'failed',
        'One or more evidence files could not be read',
      );
      throw new ResourceConflictError(
        'attachment_unavailable',
        'One or more evidence files are unavailable',
      );
    }
  }

  private throwBeginError(
    kind: Exclude<
      Awaited<ReturnType<DefectCreationRepository['begin']>>['kind'],
      'started' | 'replayed'
    >,
  ): never {
    if (kind === 'idempotency_conflict') {
      throw new ResourceConflictError(
        'idempotency_conflict',
        'This idempotency key was already used for a different request',
      );
    }
    if (kind === 'in_progress') {
      throw new ResourceConflictError(
        'issue_creation_in_progress',
        'This Jira issue creation is already in progress',
      );
    }
    if (kind === 'reconciliation_required') {
      throw new ResourceConflictError(
        'issue_creation_requires_reconciliation',
        'The previous attempt may have created a Jira issue; link it manually before retrying',
      );
    }
    if (kind === 'result_not_failed') {
      throw new ResourceConflictError(
        'result_not_failed',
        'A defect can only be created from a result that counts as a failure',
      );
    }
    if (kind === 'attachment_not_found') throw new ResourceNotFoundError('attachment');
    if (kind === 'attachment_limit_exceeded') {
      throw new PayloadTooLargeError(
        'attachment_limit_exceeded',
        'Jira evidence is limited to 10 MB per file and 25 MB total',
      );
    }
    const resources = {
      project_not_found: 'project',
      run_not_found: 'test_run',
      item_not_found: 'test_run_item',
      result_not_found: 'test_result',
      connection_not_found: 'integration_connection',
    } as const;
    throw new ResourceNotFoundError(resources[kind]);
  }

  private assertWrite(principal: OrganizationAccessPrincipal): void {
    if (principal.tokenType !== 'organization' || principal.role === 'read_only') {
      throw new AuthorizationDeniedError();
    }
  }
}
