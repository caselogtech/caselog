import type { TenantTransaction } from '../../application/services/tenant-database.service';
import type { Prisma } from '../../../../generated/prisma/client';

export type IdempotencyClaim<T> =
  | { kind: 'claimed' }
  | { kind: 'replay'; value: T }
  | { kind: 'conflict' };

export async function claimIdempotency<T>(
  transaction: TenantTransaction,
  organizationId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<IdempotencyClaim<T>> {
  const claimed = await transaction.$queryRaw<Array<{ key: string }>>`
    INSERT INTO idempotency_records (organization_id, scope, key, request_hash)
    VALUES (${organizationId}::uuid, ${scope}, ${key}, ${requestHash})
    ON CONFLICT (organization_id, scope, key) DO UPDATE
    SET request_hash = EXCLUDED.request_hash,
        response = NULL,
        created_at = CURRENT_TIMESTAMP,
        expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days'
    WHERE idempotency_records.expires_at <= CURRENT_TIMESTAMP
    RETURNING key
  `;
  if (claimed.length > 0) return { kind: 'claimed' };

  const previous = await transaction.idempotencyRecord.findUniqueOrThrow({
    where: { organizationId_scope_key: { organizationId, scope, key } },
    select: { requestHash: true, response: true },
  });
  if (previous.requestHash !== requestHash) return { kind: 'conflict' };
  if (previous.response === null) {
    throw new Error('Completed idempotency record does not contain a response');
  }
  return { kind: 'replay', value: previous.response as T };
}

export async function findIdempotency<T>(
  transaction: TenantTransaction,
  organizationId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<Exclude<IdempotencyClaim<T>, { kind: 'claimed' }> | null> {
  const previous = await transaction.idempotencyRecord.findUnique({
    where: { organizationId_scope_key: { organizationId, scope, key } },
    select: { requestHash: true, response: true, expiresAt: true },
  });
  if (!previous || previous.expiresAt <= new Date()) return null;
  if (previous.requestHash !== requestHash) return { kind: 'conflict' };
  if (previous.response === null) {
    throw new Error('Completed idempotency record does not contain a response');
  }
  return { kind: 'replay', value: previous.response as T };
}

export async function storeIdempotencyResponse<T>(
  transaction: TenantTransaction,
  organizationId: string,
  scope: string,
  key: string,
  response: T,
): Promise<void> {
  const jsonResponse = JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue;
  await transaction.idempotencyRecord.update({
    where: { organizationId_scope_key: { organizationId, scope, key } },
    data: { response: jsonResponse },
  });
}
