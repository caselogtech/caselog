import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  createJiraDataCenterConnectionResponseSchema,
  integrationConnectionListResponseSchema,
  jiraIssueSearchResponseSchema,
  jiraProjectListResponseSchema,
  type CreateJiraDataCenterConnectionRequest,
  type CreateJiraDataCenterConnectionResponse,
  type IntegrationConnectionListResponse,
  type IssueTrackerIdentity,
  type JiraIssueSearchRequest,
  type JiraIssueSearchResponse,
  type JiraProjectListResponse,
  type OrganizationAccessPrincipal,
  type UpdateJiraDataCenterCredentialsRequest,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ExternalServiceError,
  InvalidPayloadError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { CredentialVault } from '../../../core/crypto/application/ports/credential-vault';
import {
  ISSUE_TRACKER_PROVIDERS,
  type IssueTrackerConnection,
  type IssueTrackerProvider,
} from '../ports/issue-tracker-provider';
import { IssueTrackerRequestError } from '../../domain/errors/issue-tracker.error';
import { OutboundUrlPolicy } from '../../infrastructure/adapters/outbound-url.policy';
import {
  IntegrationConnectionRepository,
  type StoredIntegrationConnection,
} from '../../infrastructure/repositories/integration-connection.repository';

@Injectable()
export class IntegrationConnectionService {
  constructor(
    @Inject(IntegrationConnectionRepository)
    private readonly connections: IntegrationConnectionRepository,
    @Inject(CredentialVault) private readonly credentialVault: CredentialVault,
    @Inject(OutboundUrlPolicy) private readonly urlPolicy: OutboundUrlPolicy,
    @Inject(ISSUE_TRACKER_PROVIDERS)
    private readonly providers: IssueTrackerProvider[],
  ) {}

  async createJiraDataCenter(
    principal: OrganizationAccessPrincipal,
    idempotencyKey: string,
    request: CreateJiraDataCenterConnectionRequest,
  ): Promise<CreateJiraDataCenterConnectionResponse> {
    this.assertManage(principal);
    let baseUrl: string;
    try {
      baseUrl = this.urlPolicy.normalize(request.baseUrl);
    } catch (error) {
      this.throwProviderError(error, true);
    }

    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          name: request.name,
          baseUrl,
          personalAccessToken: request.personalAccessToken,
        }),
      )
      .digest('hex');
    const replay = await this.connections.findCreateReplay(
      principal.organizationId,
      idempotencyKey,
      requestHash,
    );
    if (replay?.kind === 'conflict') throw this.idempotencyConflict();
    if (replay?.kind === 'replay') {
      return createJiraDataCenterConnectionResponseSchema.parse(replay.value);
    }

    const provider = this.provider('jira', 'data_center');
    const remoteConnection = {
      baseUrl,
      credentials: { personalAccessToken: request.personalAccessToken },
    };
    let identity: IssueTrackerIdentity;
    try {
      identity = await provider.verifyConnection(remoteConnection);
    } catch (error) {
      this.throwProviderError(error, true);
    }

    const connectionId = randomUUID();
    const encryptedCredentials = this.credentialVault.encrypt(remoteConnection.credentials, {
      organizationId: principal.organizationId,
      connectionId,
    });
    const result = await this.connections.create(
      principal.organizationId,
      principal.sub,
      connectionId,
      idempotencyKey,
      requestHash,
      { name: request.name, baseUrl, encryptedCredentials },
      identity,
    );
    if (result.kind === 'idempotency_conflict') throw this.idempotencyConflict();
    if (result.kind === 'name_conflict') {
      throw new ResourceConflictError(
        'integration_name_conflict',
        'An active Jira connection already uses this name',
      );
    }
    return createJiraDataCenterConnectionResponseSchema.parse(result.value);
  }

  async list(principal: OrganizationAccessPrincipal): Promise<IntegrationConnectionListResponse> {
    return integrationConnectionListResponseSchema.parse({
      connections: await this.connections.list(principal.organizationId),
    });
  }

  async updateCredentials(
    principal: OrganizationAccessPrincipal,
    connectionId: string,
    request: UpdateJiraDataCenterCredentialsRequest,
  ): Promise<CreateJiraDataCenterConnectionResponse> {
    this.assertManage(principal);
    const stored = await this.requiredConnection(principal.organizationId, connectionId);
    const remoteConnection = {
      baseUrl: stored.baseUrl,
      credentials: { personalAccessToken: request.personalAccessToken },
    };
    let identity: IssueTrackerIdentity;
    try {
      identity = await this.provider(stored.provider, stored.deployment).verifyConnection(
        remoteConnection,
      );
    } catch (error) {
      this.throwProviderError(error, true);
    }

    const encryptedCredentials = this.credentialVault.encrypt(remoteConnection.credentials, {
      organizationId: principal.organizationId,
      connectionId,
    });
    const connection = await this.connections.updateCredentials(
      principal.organizationId,
      connectionId,
      encryptedCredentials,
    );
    if (!connection) throw new ResourceNotFoundError('integration_connection');
    return createJiraDataCenterConnectionResponseSchema.parse({ connection, identity });
  }

  async verify(
    principal: OrganizationAccessPrincipal,
    connectionId: string,
  ): Promise<IssueTrackerIdentity> {
    this.assertManage(principal);
    const stored = await this.requiredConnection(principal.organizationId, connectionId);
    try {
      const identity = await this.provider(stored.provider, stored.deployment).verifyConnection(
        this.remoteConnection(principal.organizationId, stored),
      );
      await this.connections.markVerified(principal.organizationId, connectionId);
      return identity;
    } catch (error) {
      await this.rememberFailure(principal.organizationId, connectionId, error);
      this.throwProviderError(error, false);
    }
  }

  async listProjects(
    principal: OrganizationAccessPrincipal,
    connectionId: string,
  ): Promise<JiraProjectListResponse> {
    const stored = await this.requiredConnection(principal.organizationId, connectionId);
    try {
      return jiraProjectListResponseSchema.parse({
        projects: await this.provider(stored.provider, stored.deployment).listProjects(
          this.remoteConnection(principal.organizationId, stored),
        ),
      });
    } catch (error) {
      await this.rememberFailure(principal.organizationId, connectionId, error);
      this.throwProviderError(error, false);
    }
  }

  async searchIssues(
    principal: OrganizationAccessPrincipal,
    connectionId: string,
    request: JiraIssueSearchRequest,
  ): Promise<JiraIssueSearchResponse> {
    const stored = await this.requiredConnection(principal.organizationId, connectionId);
    try {
      return jiraIssueSearchResponseSchema.parse(
        await this.provider(stored.provider, stored.deployment).searchIssues(
          this.remoteConnection(principal.organizationId, stored),
          request,
        ),
      );
    } catch (error) {
      await this.rememberFailure(principal.organizationId, connectionId, error);
      this.throwProviderError(error, false);
    }
  }

  async delete(principal: OrganizationAccessPrincipal, connectionId: string): Promise<void> {
    this.assertManage(principal);
    if (!(await this.connections.delete(principal.organizationId, connectionId))) {
      throw new ResourceNotFoundError('integration_connection');
    }
  }

  private async requiredConnection(
    organizationId: string,
    connectionId: string,
  ): Promise<StoredIntegrationConnection> {
    const connection = await this.connections.find(organizationId, connectionId);
    if (!connection) throw new ResourceNotFoundError('integration_connection');
    if (connection.status === 'disabled') {
      throw new InvalidPayloadError(
        'integration_disabled',
        'The integration connection is disabled',
      );
    }
    return connection;
  }

  private remoteConnection(
    organizationId: string,
    stored: StoredIntegrationConnection,
  ): IssueTrackerConnection {
    return {
      baseUrl: stored.baseUrl,
      credentials: this.credentialVault.decrypt(stored.encryptedCredentials, {
        organizationId,
        connectionId: stored.id,
      }),
    };
  }

  private provider(provider: string, deployment: string): IssueTrackerProvider {
    const match = this.providers.find(
      (candidate) => candidate.provider === provider && candidate.deployment === deployment,
    );
    if (!match) throw new Error(`Issue tracker provider ${provider}/${deployment} is unavailable`);
    return match;
  }

  private async rememberFailure(
    organizationId: string,
    connectionId: string,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof IssueTrackerRequestError
        ? error.message
        : 'Jira returned an invalid response';
    await this.connections.markError(organizationId, connectionId, message);
  }

  private throwProviderError(error: unknown, duringSetup: boolean): never {
    if (error instanceof IssueTrackerRequestError) {
      if (duringSetup && error.kind === 'authentication') {
        throw new InvalidPayloadError(
          'integration_authentication_failed',
          'Jira rejected the personal access token',
        );
      }
      if (duringSetup && error.kind === 'unavailable') {
        throw new InvalidPayloadError('integration_url_invalid', error.message);
      }
      throw new ExternalServiceError('issue_tracker_unavailable', error.message, {
        ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      });
    }
    throw new ExternalServiceError(
      'issue_tracker_invalid_response',
      'Jira returned an invalid response',
    );
  }

  private assertManage(principal: OrganizationAccessPrincipal): void {
    if (principal.tokenType !== 'organization' || !['owner', 'admin'].includes(principal.role)) {
      throw new AuthorizationDeniedError();
    }
  }

  private idempotencyConflict(): ResourceConflictError {
    return new ResourceConflictError(
      'idempotency_conflict',
      'This idempotency key was already used for a different request',
    );
  }
}
