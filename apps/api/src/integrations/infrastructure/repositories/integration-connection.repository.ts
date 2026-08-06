import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateJiraDataCenterConnectionResponse,
  IntegrationConnection,
  IssueTrackerIdentity,
} from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  claimIdempotency,
  findIdempotency,
  storeIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/idempotency';
import { Prisma } from '../../../generated/prisma/client';

type ConnectionRecord = {
  id: string;
  provider: string;
  deployment: string;
  name: string;
  baseUrl: string;
  authType: string;
  encryptedCredentials: unknown;
  status: string;
  verifiedAt: Date | null;
  lastSyncedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};

export type StoredIntegrationConnection = {
  id: string;
  provider: string;
  deployment: string;
  baseUrl: string;
  encryptedCredentials: unknown;
  status: string;
};

export type CreateConnectionResult =
  | { kind: 'created'; value: CreateJiraDataCenterConnectionResponse }
  | { kind: 'replayed'; value: CreateJiraDataCenterConnectionResponse }
  | { kind: 'idempotency_conflict' }
  | { kind: 'name_conflict' };

const CREATE_SCOPE = 'integration-connection:create:jira:data-center';

@Injectable()
export class IntegrationConnectionRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  findCreateReplay(organizationId: string, idempotencyKey: string, requestHash: string) {
    return this.tenantDatabase.run(organizationId, (transaction) =>
      findIdempotency<CreateJiraDataCenterConnectionResponse>(
        transaction,
        organizationId,
        CREATE_SCOPE,
        idempotencyKey,
        requestHash,
      ),
    );
  }

  async create(
    organizationId: string,
    createdById: string,
    id: string,
    idempotencyKey: string,
    requestHash: string,
    input: {
      name: string;
      baseUrl: string;
      encryptedCredentials: Prisma.InputJsonValue;
    },
    identity: IssueTrackerIdentity,
  ): Promise<CreateConnectionResult> {
    try {
      return await this.tenantDatabase.run(organizationId, async (transaction) => {
        const claim = await claimIdempotency<CreateJiraDataCenterConnectionResponse>(
          transaction,
          organizationId,
          CREATE_SCOPE,
          idempotencyKey,
          requestHash,
        );
        if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (claim.kind === 'replay') return { kind: 'replayed', value: claim.value };

        const record = await transaction.integrationConnection.create({
          data: {
            organizationId,
            id,
            createdById,
            provider: 'jira',
            deployment: 'data_center',
            name: input.name,
            baseUrl: input.baseUrl,
            authType: 'pat',
            encryptedCredentials: input.encryptedCredentials,
            verifiedAt: new Date(),
          },
          select: this.publicSelection,
        });
        const response = { connection: this.toPublic(record), identity };
        await storeIdempotencyResponse(
          transaction,
          organizationId,
          CREATE_SCOPE,
          idempotencyKey,
          response,
        );
        return { kind: 'created', value: response };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { kind: 'name_conflict' };
      }
      throw error;
    }
  }

  async list(organizationId: string): Promise<IntegrationConnection[]> {
    const records = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.integrationConnection.findMany({
        where: { organizationId, provider: 'jira', deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: this.publicSelection,
      }),
    );
    return records.map((record) => this.toPublic(record));
  }

  find(organizationId: string, connectionId: string): Promise<StoredIntegrationConnection | null> {
    return this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.integrationConnection.findFirst({
        where: { organizationId, id: connectionId, provider: 'jira', deletedAt: null },
        select: {
          id: true,
          provider: true,
          deployment: true,
          baseUrl: true,
          encryptedCredentials: true,
          status: true,
        },
      }),
    );
  }

  async markVerified(organizationId: string, connectionId: string): Promise<void> {
    await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.integrationConnection.updateMany({
        where: { organizationId, id: connectionId, deletedAt: null },
        data: { status: 'active', lastError: null, verifiedAt: new Date() },
      }),
    );
  }

  async updateCredentials(
    organizationId: string,
    connectionId: string,
    encryptedCredentials: Prisma.InputJsonValue,
  ): Promise<IntegrationConnection | null> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const updated = await transaction.integrationConnection.updateMany({
        where: { organizationId, id: connectionId, deletedAt: null },
        data: {
          encryptedCredentials,
          status: 'active',
          lastError: null,
          verifiedAt: new Date(),
        },
      });
      if (updated.count === 0) return null;
      const record = await transaction.integrationConnection.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id: connectionId } },
        select: this.publicSelection,
      });
      return this.toPublic(record);
    });
  }

  async markError(organizationId: string, connectionId: string, message: string): Promise<void> {
    await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.integrationConnection.updateMany({
        where: { organizationId, id: connectionId, deletedAt: null },
        data: { status: 'error', lastError: message },
      }),
    );
  }

  async delete(organizationId: string, connectionId: string): Promise<boolean> {
    const result = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.integrationConnection.updateMany({
        where: { organizationId, id: connectionId, provider: 'jira', deletedAt: null },
        data: {
          status: 'disabled',
          deletedAt: new Date(),
          encryptedCredentials: { deleted: true },
        },
      }),
    );
    return result.count === 1;
  }

  private readonly publicSelection = {
    id: true,
    provider: true,
    deployment: true,
    name: true,
    baseUrl: true,
    authType: true,
    status: true,
    verifiedAt: true,
    lastSyncedAt: true,
    lastError: true,
    createdAt: true,
  } as const;

  private toPublic(record: Omit<ConnectionRecord, 'encryptedCredentials'>): IntegrationConnection {
    return {
      id: record.id,
      provider: 'jira',
      deployment: 'data_center',
      name: record.name,
      baseUrl: record.baseUrl,
      authType: 'pat',
      status: record.status as IntegrationConnection['status'],
      verifiedAt: record.verifiedAt?.toISOString() ?? null,
      lastSyncedAt: record.lastSyncedAt?.toISOString() ?? null,
      lastError: record.lastError,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
