import { Inject, Injectable } from '@nestjs/common';
import type {
  JiraIssue,
  JiraIssueSearchRequest,
  JiraIssueSearchResponse,
  JiraProject,
} from '@caselog/schemas';
import { InvalidPayloadError, ResourceNotFoundError } from '../../../common/errors/domain.error';
import { CredentialVault } from '../../../core/crypto/application/ports/credential-vault';
import {
  ISSUE_TRACKER_PROVIDERS,
  type CreateIssueInput,
  type CreatedIssue,
  type IssueTrackerConnection,
  type IssueTrackerProvider,
} from '../ports/issue-tracker-provider';
import { IssueTrackerRequestError } from '../../domain/errors/issue-tracker.error';
import {
  IntegrationConnectionRepository,
  type StoredIntegrationConnection,
} from '../../infrastructure/repositories/integration-connection.repository';

@Injectable()
export class IssueTrackerClientService {
  constructor(
    @Inject(IntegrationConnectionRepository)
    private readonly connections: IntegrationConnectionRepository,
    @Inject(CredentialVault) private readonly credentialVault: CredentialVault,
    @Inject(ISSUE_TRACKER_PROVIDERS)
    private readonly providers: IssueTrackerProvider[],
  ) {}

  async getIssue(
    organizationId: string,
    connectionId: string,
    issueKey: string,
  ): Promise<JiraIssue> {
    return this.withConnection(organizationId, connectionId, (provider, connection) =>
      provider.getIssue(connection, issueKey),
    );
  }

  async createIssue(
    organizationId: string,
    connectionId: string,
    input: CreateIssueInput,
  ): Promise<CreatedIssue> {
    return this.withConnection(organizationId, connectionId, (provider, connection) =>
      provider.createIssue(connection, input),
    );
  }

  async listProjects(organizationId: string, connectionId: string): Promise<JiraProject[]> {
    return this.withConnection(organizationId, connectionId, (provider, connection) =>
      provider.listProjects(connection),
    );
  }

  async searchIssues(
    organizationId: string,
    connectionId: string,
    request: JiraIssueSearchRequest,
  ): Promise<JiraIssueSearchResponse> {
    return this.withConnection(organizationId, connectionId, (provider, connection) =>
      provider.searchIssues(connection, request),
    );
  }

  private async withConnection<T>(
    organizationId: string,
    connectionId: string,
    operation: (provider: IssueTrackerProvider, connection: IssueTrackerConnection) => Promise<T>,
  ): Promise<T> {
    const stored = await this.requiredConnection(organizationId, connectionId);
    try {
      return await operation(
        this.provider(stored.provider, stored.deployment),
        this.remoteConnection(organizationId, stored),
      );
    } catch (error) {
      const message =
        error instanceof IssueTrackerRequestError
          ? error.message
          : 'The issue tracker returned an invalid response';
      if (!(error instanceof IssueTrackerRequestError) || error.kind !== 'rejected') {
        await this.connections.markError(organizationId, connectionId, message);
      }
      throw error;
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
}
