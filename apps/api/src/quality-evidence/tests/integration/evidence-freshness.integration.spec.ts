import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';
import { EvidenceSnapshotRepository } from '../../infrastructure/repositories/evidence-snapshot.repository';

describe('evidence freshness revisions', () => {
  let admin: PrismaClient;
  let application: PrismaClient;
  let snapshots: EvidenceSnapshotRepository;
  const organizationId = randomUUID();
  const foreignOrganizationId = randomUUID();
  const projectId = randomUUID();
  const candidateId = randomUUID();
  const checkpoint = new Date();
  const firstExpiry = new Date(checkpoint.getTime() + 60_000);
  const secondExpiry = new Date(checkpoint.getTime() + 120_000);

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    const applicationUrl = process.env.DATABASE_URL;
    if (!adminUrl || !applicationUrl) throw new Error('Database URLs are required');
    admin = createPrismaClient(adminUrl);
    application = createPrismaClient(applicationUrl);
    snapshots = new EvidenceSnapshotRepository(new TenantDatabaseService(application as never));
    await admin.organization.createMany({
      data: [
        { id: organizationId, name: 'Freshness', slug: `freshness-${organizationId.slice(0, 8)}` },
        {
          id: foreignOrganizationId,
          name: 'Foreign',
          slug: `freshness-${foreignOrganizationId.slice(0, 8)}`,
        },
      ],
    });
    await admin.project.create({
      data: { id: projectId, organizationId, key: 'FRESH', slug: 'freshness', name: 'Freshness' },
    });
    const release = await admin.release.create({
      data: { organizationId, projectId, key: 'FRESH-1', name: 'Freshness' },
    });
    await admin.releaseCandidate.create({
      data: {
        id: candidateId,
        organizationId,
        projectId,
        releaseId: release.id,
        sequence: 1,
        sourceRevision: 'freshness',
        identityHash: 'f'.repeat(64),
      },
    });
    const producer = await admin.evidenceProducer.create({
      data: {
        organizationId,
        producerType: 'test',
        producerKey: 'freshness',
        schemaVersion: 1,
        trustLevel: 'VERIFIED',
      },
    });
    await admin.candidateEvidenceRevision.create({
      data: { organizationId, projectId, candidateId, revision: 1, updatedAt: checkpoint },
    });
    for (const [index, expiresAt] of [
      firstExpiry,
      secondExpiry,
      null,
      new Date(checkpoint.getTime() + 1),
    ].entries()) {
      const dimensionsHash = String(index).repeat(64);
      const observation = await admin.evidenceObservation.create({
        data: {
          organizationId,
          projectId,
          candidateId,
          producerId: producer.id,
          producerSchemaVersion: 1,
          metricKey: 'test.pass_rate',
          metricVersion: '1.0.0',
          valueType: 'PERCENTAGE',
          state: 'AVAILABLE',
          percentageValue: '100',
          dimensions: { testRunRole: 'required' },
          dimensionsHash,
          observedAt: checkpoint,
          expiresAt,
          trustLevel: 'VERIFIED',
          sourceType: 'test',
          sourceId: String(index),
          sourceRevision: '1',
          idempotencyKey: String(index),
        },
      });
      // The fourth observation has been superseded and must not invalidate current evidence.
      if (index < 3)
        await admin.currentEvidenceObservation.create({
          data: {
            organizationId,
            projectId,
            candidateId,
            producerId: producer.id,
            metricKey: 'test.pass_rate',
            dimensionsHash,
            observationId: observation.id,
            evidenceRevision: 1,
          },
        });
    }
  });

  afterAll(async () => {
    vi.useRealTimers();
    if (admin) {
      await admin.organization.deleteMany({
        where: { id: { in: [organizationId, foreignOrganizationId] } },
      });
      await admin.$disconnect();
    }
    await application?.$disconnect();
  });

  it('detects each expiration boundary once, including concurrent snapshot and summary reads', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(firstExpiry.getTime() - 1));
      expect(await snapshots.load(organizationId, projectId, candidateId)).toMatchObject({
        revision: 1,
      });
      vi.setSystemTime(firstExpiry);
      const [first, second, summaries] = await Promise.all([
        snapshots.load(organizationId, projectId, candidateId),
        snapshots.load(organizationId, projectId, candidateId),
        snapshots.revisions(organizationId, projectId, [candidateId]),
      ]);
      expect([first.revision, second.revision, summaries[0]?.revision]).toEqual([2, 2, 2]);
      expect(first.observations).toHaveLength(3);
      expect(first.observations).toEqual(second.observations);
      vi.setSystemTime(secondExpiry);
      expect(await snapshots.load(organizationId, projectId, candidateId)).toMatchObject({
        revision: 3,
      });
      expect(await snapshots.load(organizationId, projectId, candidateId)).toMatchObject({
        revision: 3,
      });
      expect(await admin.evidenceObservation.count({ where: { organizationId } })).toBe(4);
      const events = await admin.integrationEvent.findMany({
        where: { organizationId, eventName: 'quality_evidence.candidate_revision_advanced' },
        orderBy: { sourceRevision: 'asc' },
      });
      expect(events.map(({ sourceRevision }) => sourceRevision)).toEqual(['2', '3']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not read or advance another tenant or project revision', async () => {
    const before = await admin.candidateEvidenceRevision.findFirstOrThrow({
      where: { organizationId, candidateId },
    });
    expect(await snapshots.load(foreignOrganizationId, projectId, candidateId)).toEqual({
      candidateId,
      revision: 0,
      observations: [],
    });
    expect(await snapshots.revisions(foreignOrganizationId, projectId, [candidateId])).toEqual([
      { candidateId, revision: 0 },
    ]);
    expect(await snapshots.load(organizationId, randomUUID(), candidateId)).toEqual({
      candidateId,
      revision: 0,
      observations: [],
    });
    expect(
      await admin.candidateEvidenceRevision.findFirstOrThrow({
        where: { organizationId, candidateId },
      }),
    ).toEqual(before);
    expect(await application.candidateEvidenceRevision.findMany()).toEqual([]);
  });
});
