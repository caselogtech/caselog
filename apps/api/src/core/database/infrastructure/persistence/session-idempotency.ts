import type { Prisma } from '../../../../generated/prisma/client';

export type SessionIdempotencyClaim<T> =
  | { kind: 'claimed' }
  | { kind: 'replay'; value: T }
  | { kind: 'conflict' };

export async function claimSessionIdempotency<T>(
  transaction: Prisma.TransactionClient,
  userId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<SessionIdempotencyClaim<T>> {
  const claimed = await transaction.$queryRaw<Array<{ key: string }>>`
    INSERT INTO session_idempotency_records (user_id, scope, key, request_hash)
    VALUES (${userId}::uuid, ${scope}, ${key}, ${requestHash})
    ON CONFLICT (user_id, scope, key) DO UPDATE
    SET request_hash = EXCLUDED.request_hash,
        response = NULL,
        created_at = CURRENT_TIMESTAMP,
        expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days'
    WHERE session_idempotency_records.expires_at <= CURRENT_TIMESTAMP
    RETURNING key
  `;
  if (claimed.length > 0) return { kind: 'claimed' };

  const previous = await transaction.sessionIdempotencyRecord.findUniqueOrThrow({
    where: { userId_scope_key: { userId, scope, key } },
    select: { requestHash: true, response: true },
  });
  if (previous.requestHash !== requestHash) return { kind: 'conflict' };
  if (previous.response === null) {
    throw new Error('Completed session idempotency record does not contain a response');
  }
  return { kind: 'replay', value: previous.response as T };
}

export async function findSessionIdempotency<T>(
  transaction: Prisma.TransactionClient,
  userId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<Exclude<SessionIdempotencyClaim<T>, { kind: 'claimed' }> | null> {
  const previous = await transaction.sessionIdempotencyRecord.findUnique({
    where: { userId_scope_key: { userId, scope, key } },
    select: { requestHash: true, response: true, expiresAt: true },
  });
  if (!previous || previous.expiresAt <= new Date()) return null;
  if (previous.requestHash !== requestHash) return { kind: 'conflict' };
  if (previous.response === null) {
    throw new Error('Completed session idempotency record does not contain a response');
  }
  return { kind: 'replay', value: previous.response as T };
}

export async function storeSessionIdempotencyResponse<T>(
  transaction: Prisma.TransactionClient,
  userId: string,
  scope: string,
  key: string,
  response: T,
): Promise<void> {
  const jsonResponse = JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue;
  await transaction.sessionIdempotencyRecord.update({
    where: { userId_scope_key: { userId, scope, key } },
    data: { response: jsonResponse },
  });
}
