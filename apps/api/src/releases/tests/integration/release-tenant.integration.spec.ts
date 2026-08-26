import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import { runInTenant } from '../../../core/database/application/services/tenant-database.service';

describe('release tenant isolation', () => {
  let admin: PrismaClient;
  let application: PrismaClient;
  let firstOrganizationId = '';
  let secondOrganizationId = '';
  let firstReleaseId = '';
  const organizationIds: string[] = [];

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    const applicationUrl = process.env.DATABASE_URL;
    if (!adminUrl || !applicationUrl) {
      throw new Error('Database URLs are required for release tenant tests');
    }
    admin = createPrismaClient(adminUrl);
    application = createPrismaClient(applicationUrl);
    const suffix = randomUUID().slice(0, 8);
    for (const label of ['alpha', 'beta']) {
      const organization = await admin.organization.create({
        data: { name: `Release ${label}`, slug: `release-${label}-${suffix}` },
      });
      organizationIds.push(organization.id);
      if (label === 'alpha') firstOrganizationId = organization.id;
      else secondOrganizationId = organization.id;
      const project = await admin.project.create({
        data: {
          organizationId: organization.id,
          key: label.toUpperCase(),
          slug: 'shared-project',
          name: `Project ${label}`,
        },
      });
      const release = await admin.release.create({
        data: {
          organizationId: organization.id,
          projectId: project.id,
          key: 'SHARED-1',
          name: `Release ${label}`,
        },
      });
      if (label === 'alpha') firstReleaseId = release.id;
    }
  });

  afterAll(async () => {
    await admin.release.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await admin.project.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await admin.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await Promise.all([admin.$disconnect(), application.$disconnect()]);
  });

  it('returns no release data without tenant context', async () => {
    await expect(application.release.findMany()).resolves.toEqual([]);
  });

  it('returns only the selected tenant release for identical project and release keys', async () => {
    const releases = await runInTenant(application, firstOrganizationId, (transaction) =>
      transaction.release.findMany({ select: { id: true, name: true } }),
    );
    expect(releases).toEqual([{ id: firstReleaseId, name: 'Release alpha' }]);
  });

  it('rejects a cross-tenant release write', async () => {
    const foreignProject = await admin.project.findFirstOrThrow({
      where: { organizationId: secondOrganizationId },
    });
    await expect(
      runInTenant(application, firstOrganizationId, (transaction) =>
        transaction.release.create({
          data: {
            organizationId: secondOrganizationId,
            projectId: foreignProject.id,
            key: 'FOREIGN',
            name: 'Foreign release',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
