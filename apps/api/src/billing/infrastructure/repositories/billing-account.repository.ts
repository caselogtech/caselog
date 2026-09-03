import { Inject, Injectable } from '@nestjs/common';
import type { BillingAccount, BillingAccountRole } from '@caselog/schemas';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';
import {
  claimSessionIdempotency,
  storeSessionIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/session-idempotency';

type BillingAccountRow = {
  id: string;
  name: string;
  role: BillingAccountRole;
  workspaceCount: bigint;
  createdAt: Date;
};

export type CreateBillingAccountResult =
  | { kind: 'created' | 'replayed'; value: BillingAccount }
  | { kind: 'idempotency_conflict' };

@Injectable()
export class BillingAccountRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<BillingAccount[]> {
    const rows = await this.withSessionUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<BillingAccountRow[]>`
        SELECT
          id,
          name,
          role,
          workspace_count AS "workspaceCount",
          created_at AS "createdAt"
        FROM public.list_current_user_billing_accounts()
      `,
    );
    return rows.map(mapBillingAccount);
  }

  async create(
    userId: string,
    idempotencyKey: string,
    requestHash: string,
    name: string,
  ): Promise<CreateBillingAccountResult> {
    return this.withSessionUser(userId, async (transaction) => {
      const scope = 'billing-accounts:create';
      const claim = await claimSessionIdempotency<BillingAccount>(
        transaction,
        userId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (claim.kind === 'replay') return { kind: 'replayed', value: claim.value };

      const rows = await transaction.$queryRaw<BillingAccountRow[]>`
        SELECT
          id,
          name,
          role,
          workspace_count AS "workspaceCount",
          created_at AS "createdAt"
        FROM public.create_current_user_billing_account(${name}::VARCHAR(120))
      `;
      const row = rows[0];
      if (!row) throw new Error('Billing account creation returned no row');
      const account = mapBillingAccount(row);
      await storeSessionIdempotencyResponse(transaction, userId, scope, idempotencyKey, account);
      return { kind: 'created', value: account };
    });
  }

  async roleForUser(userId: string, billingAccountId: string): Promise<BillingAccountRole | null> {
    const rows = await this.withSessionUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<Array<{ role: BillingAccountRole | null }>>`
        SELECT public.current_user_billing_account_role(${billingAccountId}::UUID) AS role
      `,
    );
    return rows[0]?.role ?? null;
  }

  private withSessionUser<T>(
    userId: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT set_config('caselog.user_id', ${userId}, true)`;
      return operation(transaction);
    });
  }
}

function mapBillingAccount(row: BillingAccountRow): BillingAccount {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    workspaceCount: Number(row.workspaceCount),
    createdAt: row.createdAt.toISOString(),
  };
}
