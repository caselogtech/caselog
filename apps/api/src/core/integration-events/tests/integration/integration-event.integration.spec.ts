import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../../generated/prisma/client';
import { runInTenant } from '../../../database/application/services/tenant-database.service';
import { createPrismaClient } from '../../../database/infrastructure/prisma/prisma-client';
import {
  appendIntegrationEvent,
  markIntegrationEventsConsumed,
  readUnconsumedIntegrationEvents,
} from '../../public-api';

describe('integration event persistence', () => {
  let admin: PrismaClient;
  let application: PrismaClient;
  const organizationIds: string[] = [];

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    const applicationUrl = process.env.DATABASE_URL;
    if (!adminUrl || !applicationUrl) {
      throw new Error('Database URLs are required for integration event tests');
    }
    admin = createPrismaClient(adminUrl);
    application = createPrismaClient(applicationUrl);
    const suffix = randomUUID().slice(0, 8);
    for (const label of ['alpha', 'beta']) {
      const organization = await admin.organization.create({
        data: { name: `Events ${label}`, slug: `events-${label}-${suffix}` },
      });
      organizationIds.push(organization.id);
      await admin.integrationEvent.create({
        data: {
          organizationId: organization.id,
          eventName: 'test.source_changed',
          schemaVersion: 1,
          sourceType: 'test_source',
          sourceId: label,
          sourceRevision: '1',
          payload: { label },
          occurredAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    await admin.integrationEvent.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await admin.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await Promise.all([admin.$disconnect(), application.$disconnect()]);
  });

  it('hides every event without tenant context', async () => {
    await expect(application.integrationEvent.findMany()).resolves.toEqual([]);
    await expect(application.integrationEventReceipt.findMany()).resolves.toEqual([]);
  });

  it('reads and appends events only inside the selected tenant', async () => {
    const organizationId = organizationAt(organizationIds, 0);
    await runInTenant(application, organizationId, async (transaction) => {
      const existing = await transaction.integrationEvent.findMany({
        select: { organizationId: true, sourceId: true },
      });
      expect(existing).toEqual([{ organizationId, sourceId: 'alpha' }]);

      await appendIntegrationEvent(transaction, {
        id: randomUUID(),
        name: 'test.source_changed',
        schemaVersion: 1,
        organizationId,
        source: { type: 'test_source', id: 'alpha', revision: '2' },
        occurredAt: new Date().toISOString(),
        payload: { label: 'alpha', revision: 2 },
      });
    });

    await expect(
      runInTenant(application, organizationId, (transaction) =>
        appendIntegrationEvent(transaction, {
          id: randomUUID(),
          name: 'test.source_changed',
          schemaVersion: 1,
          organizationId: organizationAt(organizationIds, 1),
          source: { type: 'test_source', id: 'foreign', revision: '1' },
          occurredAt: new Date().toISOString(),
          payload: { label: 'foreign' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('tracks consumption independently for each idempotent consumer', async () => {
    const organizationId = organizationAt(organizationIds, 0);
    await runInTenant(application, organizationId, async (transaction) => {
      const firstConsumerEvents = await readUnconsumedIntegrationEvents(transaction, {
        organizationId,
        consumerName: 'quality-evidence',
        eventNames: ['test.source_changed'],
      });
      expect(firstConsumerEvents).toHaveLength(2);
      expect(firstConsumerEvents.every((event) => event.organizationId === organizationId)).toBe(
        true,
      );
      const firstEvent = firstConsumerEvents.at(0);
      if (!firstEvent) throw new Error('Expected an integration event');

      await markIntegrationEventsConsumed(transaction, {
        organizationId,
        consumerName: 'quality-evidence',
        eventIds: [firstEvent.id],
      });
      await markIntegrationEventsConsumed(transaction, {
        organizationId,
        consumerName: 'quality-evidence',
        eventIds: [firstEvent.id],
      });

      await expect(
        readUnconsumedIntegrationEvents(transaction, {
          organizationId,
          consumerName: 'quality-evidence',
          eventNames: ['test.source_changed'],
        }),
      ).resolves.toHaveLength(1);
      await expect(
        readUnconsumedIntegrationEvents(transaction, {
          organizationId,
          consumerName: 'another-consumer',
          eventNames: ['test.source_changed'],
        }),
      ).resolves.toHaveLength(2);
    });
  });

  it('rejects duplicate source revisions and event mutation', async () => {
    const organizationId = organizationAt(organizationIds, 0);
    await expect(
      runInTenant(application, organizationId, (transaction) =>
        appendIntegrationEvent(transaction, {
          id: randomUUID(),
          name: 'test.source_changed',
          schemaVersion: 1,
          organizationId,
          source: { type: 'test_source', id: 'alpha', revision: '1' },
          occurredAt: new Date().toISOString(),
          payload: { label: 'duplicate' },
        }),
      ),
    ).rejects.toThrow();

    const event = await admin.integrationEvent.findFirstOrThrow({ where: { organizationId } });
    await expect(
      admin.integrationEvent.update({
        where: { organizationId_id: { organizationId, id: event.id } },
        data: { schemaVersion: 2 },
      }),
    ).rejects.toThrow(/immutable/);
  });
});

function organizationAt(organizationIds: string[], index: number): string {
  const organizationId = organizationIds.at(index);
  if (!organizationId) throw new Error(`Expected organization at index ${index}`);
  return organizationId;
}
