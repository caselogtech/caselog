import { Inject, Injectable } from '@nestjs/common';
import type {
  ApiTokenPrincipal,
  ApiTokenScope as ApiTokenScopeValue,
  ApiTokenSummary,
} from '@caselog/schemas';
import { PrismaService } from '../core/database/prisma.service';
import { TenantDatabaseService } from '../core/database/tenant-database.service';
import type { ApiTokenScope } from '../generated/prisma/enums';

const SCOPE_TO_DATABASE: Record<ApiTokenScopeValue, ApiTokenScope> = {
  'results:write': 'RESULTS_WRITE',
  'runs:read': 'RUNS_READ',
};

const SCOPE_FROM_DATABASE: Record<ApiTokenScope, ApiTokenScopeValue> = {
  RESULTS_WRITE: 'results:write',
  RUNS_READ: 'runs:read',
};

type ApiTokenRecord = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: ApiTokenScope[];
  expiresAt: Date;
  lastUsedAt: Date | null;
  createdAt: Date;
  createdBy: { id: string; displayName: string };
};

type AuthenticatedApiTokenRow = {
  apiTokenId: string;
  organizationId: string;
  createdById: string;
  membershipId: string;
  role: ApiTokenPrincipal['role'];
  scopes: ApiTokenScopeValue[];
};

@Injectable()
export class ApiTokenRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async create(
    organizationId: string,
    createdById: string,
    input: {
      name: string;
      tokenPrefix: string;
      tokenHash: string;
      scopes: ApiTokenScopeValue[];
      expiresAt: Date;
    },
  ): Promise<ApiTokenSummary> {
    const record = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.apiToken.create({
        data: {
          organizationId,
          createdById,
          name: input.name,
          tokenPrefix: input.tokenPrefix,
          tokenHash: input.tokenHash,
          scopes: input.scopes.map((scope) => SCOPE_TO_DATABASE[scope]),
          expiresAt: input.expiresAt,
        },
        select: this.summarySelection,
      }),
    );
    return this.toSummary(record);
  }

  async list(organizationId: string): Promise<ApiTokenSummary[]> {
    const records = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.apiToken.findMany({
        where: { organizationId, revokedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: this.summarySelection,
      }),
    );
    return records.map((record) => this.toSummary(record));
  }

  async revoke(organizationId: string, tokenId: string): Promise<boolean> {
    const result = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.apiToken.updateMany({
        where: { organizationId, id: tokenId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
    return result.count === 1;
  }

  async authenticate(tokenHash: string): Promise<ApiTokenPrincipal | undefined> {
    const rows = await this.prisma.$queryRaw<AuthenticatedApiTokenRow[]>`
      SELECT
        api_token_id AS "apiTokenId",
        organization_id AS "organizationId",
        created_by_id AS "createdById",
        membership_id AS "membershipId",
        role,
        scopes::TEXT[] AS scopes
      FROM public.authenticate_api_token(${tokenHash}::CHAR(64))
    `;
    const row = rows[0];
    if (!row) return undefined;

    return {
      sub: row.createdById,
      tokenType: 'api_token',
      apiTokenId: row.apiTokenId,
      organizationId: row.organizationId,
      membershipId: row.membershipId,
      role: row.role,
      scopes: row.scopes,
    };
  }

  private readonly summarySelection = {
    id: true,
    name: true,
    tokenPrefix: true,
    scopes: true,
    expiresAt: true,
    lastUsedAt: true,
    createdAt: true,
    createdBy: { select: { id: true, displayName: true } },
  } as const;

  private toSummary(record: ApiTokenRecord): ApiTokenSummary {
    return {
      ...record,
      scopes: record.scopes.map((scope) => SCOPE_FROM_DATABASE[scope]),
      expiresAt: record.expiresAt.toISOString(),
      lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
