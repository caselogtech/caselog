import type { Prisma } from '../../../../generated/prisma/client';
import type { TenantTransaction } from '../../../database/application/services/tenant-database.service';
import type {
  IntegrationEventContract,
  IntegrationEventPayload,
  PersistedIntegrationEvent,
} from '../../application/ports/integration-event';

const MAX_BATCH_SIZE = 500;

export async function appendIntegrationEvent(
  transaction: TenantTransaction,
  event: IntegrationEventContract,
): Promise<void> {
  await transaction.integrationEvent.create({
    data: {
      organizationId: event.organizationId,
      id: event.id,
      eventName: event.name,
      schemaVersion: event.schemaVersion,
      sourceType: event.source.type,
      sourceId: event.source.id,
      sourceRevision: event.source.revision,
      occurredAt: new Date(event.occurredAt),
      payload: event.payload as Prisma.InputJsonObject,
    },
  });
}

export async function readUnconsumedIntegrationEvents(
  transaction: TenantTransaction,
  input: {
    organizationId: string;
    consumerName: string;
    eventNames: readonly string[];
    limit?: number;
  },
): Promise<PersistedIntegrationEvent[]> {
  if (input.eventNames.length === 0) return [];
  const limit = Math.min(Math.max(input.limit ?? 100, 1), MAX_BATCH_SIZE);
  const records = await transaction.integrationEvent.findMany({
    where: {
      organizationId: input.organizationId,
      eventName: { in: [...input.eventNames] },
      receipts: { none: { consumerName: input.consumerName } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit,
  });

  return records.map((record) => ({
    id: record.id,
    name: record.eventName,
    schemaVersion: record.schemaVersion,
    organizationId: record.organizationId,
    source: {
      type: record.sourceType,
      id: record.sourceId,
      revision: record.sourceRevision,
    },
    occurredAt: record.occurredAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    payload: record.payload as IntegrationEventPayload,
  }));
}

export async function markIntegrationEventsConsumed(
  transaction: TenantTransaction,
  input: { organizationId: string; consumerName: string; eventIds: readonly string[] },
): Promise<void> {
  if (input.eventIds.length === 0) return;
  await transaction.integrationEventReceipt.createMany({
    data: input.eventIds.map((eventId) => ({
      organizationId: input.organizationId,
      consumerName: input.consumerName,
      eventId,
    })),
    skipDuplicates: true,
  });
}
