import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import { WorkspacePurgeRepository } from '../../infrastructure/repositories/workspace-purge.repository';

describe('workspace purge repository', () => {
  let admin: PrismaClient;
  let application: PrismaClient;
  let organizationId: string | undefined;

  beforeAll(() => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    const applicationUrl = process.env.DATABASE_URL;
    if (!adminUrl || !applicationUrl) {
      throw new Error('Database URLs are required for workspace purge tests');
    }
    admin = createPrismaClient(adminUrl);
    application = createPrismaClient(applicationUrl);
  });

  afterAll(async () => {
    if (organizationId) {
      await admin.releaseLifecycleEvent.deleteMany({ where: { organizationId } });
      await admin.candidateTestRun.deleteMany({ where: { organizationId } });
      await admin.releaseCandidate.deleteMany({ where: { organizationId } });
      await admin.release.deleteMany({ where: { organizationId } });
      await admin.environment.deleteMany({ where: { organizationId } });
      await admin.testRun.deleteMany({ where: { organizationId } });
      await admin.suite.deleteMany({ where: { organizationId } });
      await admin.project.deleteMany({ where: { organizationId } });
      await admin.attachmentBlob.deleteMany({ where: { organizationId } });
      await admin.auditLog.deleteMany({ where: { organizationId } });
      await admin.usageCounter.deleteMany({ where: { organizationId } });
      await admin.organization.deleteMany({ where: { id: organizationId } });
    }
    await Promise.all([admin.$disconnect(), application.$disconnect()]);
  });

  it('allows only claimed and expired workspaces to be deleted with all tenant metadata', async () => {
    const suffix = randomUUID().slice(0, 8);
    const deletedAt = new Date('2026-07-01T00:00:00.000Z');
    const organization = await admin.organization.create({
      data: {
        name: 'Purge integration',
        slug: `purge-${suffix}`,
        deletedAt,
        projects: {
          create: {
            key: 'PURGE',
            slug: 'purge-project',
            name: 'Purge project',
            suites: { create: { name: 'Purge suite' } },
          },
        },
        auditLogs: {
          create: {
            actorId: randomUUID(),
            actorType: 'system',
            action: 'workspace.purge_test',
            targetType: 'workspace',
          },
        },
        attachmentBlobs: {
          create: {
            checksumSha256: 'a'.repeat(64),
            storageKey: `${suffix}/purge-object`,
            sizeBytes: 10,
          },
        },
      },
    });
    organizationId = organization.id;
    const project = await admin.project.findFirstOrThrow({
      where: { organizationId, slug: 'purge-project' },
    });
    const environment = await admin.environment.create({
      data: {
        organizationId,
        projectId: project.id,
        name: 'Purge environment',
        slug: 'purge-environment',
      },
    });
    const release = await admin.release.create({
      data: {
        organizationId,
        projectId: project.id,
        environmentId: environment.id,
        key: 'PURGE-1',
        name: 'Purge release',
      },
    });
    await admin.releaseLifecycleEvent.create({
      data: {
        organizationId,
        projectId: project.id,
        releaseId: release.id,
        toState: 'DRAFT',
      },
    });
    const candidate = await admin.releaseCandidate.create({
      data: {
        organizationId,
        projectId: project.id,
        releaseId: release.id,
        sequence: 1,
        sourceRevision: 'purge-revision',
        identityHash: 'b'.repeat(64),
      },
    });
    const run = await admin.testRun.create({
      data: { organizationId, projectId: project.id, name: 'Purge run' },
    });
    await admin.candidateTestRun.create({
      data: {
        organizationId,
        projectId: project.id,
        candidateId: candidate.id,
        testRunId: run.id,
      },
    });
    const repository = new WorkspacePurgeRepository(application as never);

    await expect(
      application.organization.delete({ where: { id: organizationId } }),
    ).rejects.toThrow();
    await expect(
      application.organization.update({
        where: { id: organizationId },
        data: { purgeStartedAt: new Date() },
      }),
    ).rejects.toThrow();

    const recent = await admin.organization.create({
      data: {
        name: 'Still recoverable',
        slug: `recoverable-${suffix}`,
        deletedAt: new Date(),
      },
    });
    await expect(repository.claim(recent.id)).resolves.toBe(false);
    await admin.organization.delete({ where: { id: recent.id } });

    await expect(repository.claim(organizationId)).resolves.toBe(true);
    await expect(repository.purge(organizationId)).resolves.toBe(true);

    await expect(admin.organization.count({ where: { id: organizationId } })).resolves.toBe(0);
    await expect(admin.project.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.suite.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.auditLog.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.attachmentBlob.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.usageCounter.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.environment.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.release.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.releaseCandidate.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.candidateTestRun.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.releaseLifecycleEvent.count({ where: { organizationId } })).resolves.toBe(0);
    organizationId = undefined;
  });
});
