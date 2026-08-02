import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { createPrismaClient } from './prisma-client';
import { runInTenant } from './tenant-database.service';

describe('tenant database isolation', () => {
  let admin: PrismaClient;
  let application: PrismaClient;
  let firstOrganizationId: string;
  let secondOrganizationId: string;

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    const applicationUrl = process.env.DATABASE_URL;
    if (!adminUrl || !applicationUrl) {
      throw new Error('Database URLs are required for integration tests');
    }

    admin = createPrismaClient(adminUrl);
    application = createPrismaClient(applicationUrl);

    const suffix = randomUUID().slice(0, 8);
    const [firstOrganization, secondOrganization] = await Promise.all([
      admin.organization.create({ data: { name: 'RLS Alpha', slug: `rls-a-${suffix}` } }),
      admin.organization.create({ data: { name: 'RLS Beta', slug: `rls-b-${suffix}` } }),
    ]);
    firstOrganizationId = firstOrganization.id;
    secondOrganizationId = secondOrganization.id;

    await Promise.all([
      admin.project.create({
        data: {
          organizationId: firstOrganizationId,
          key: 'ALPHA',
          slug: 'alpha',
          name: 'Alpha project',
        },
      }),
      admin.project.create({
        data: {
          organizationId: secondOrganizationId,
          key: 'BETA',
          slug: 'beta',
          name: 'Beta project',
        },
      }),
    ]);
  });

  afterAll(async () => {
    await admin.project.deleteMany({
      where: { organizationId: { in: [firstOrganizationId, secondOrganizationId] } },
    });
    await admin.organization.deleteMany({
      where: { id: { in: [firstOrganizationId, secondOrganizationId] } },
    });
    await Promise.all([admin.$disconnect(), application.$disconnect()]);
  });

  it('returns no tenant data without transaction context', async () => {
    await expect(application.project.findMany()).resolves.toEqual([]);
  });

  it('returns only rows owned by the selected organization', async () => {
    const projects = await runInTenant(application, firstOrganizationId, (transaction) =>
      transaction.project.findMany({ orderBy: { name: 'asc' } }),
    );

    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe('Alpha project');
  });

  it('rejects a write for another organization', async () => {
    await expect(
      runInTenant(application, firstOrganizationId, (transaction) =>
        transaction.project.create({
          data: {
            organizationId: secondOrganizationId,
            key: 'FOREIGN',
            slug: 'foreign',
            name: 'Foreign project',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('does not leak tenant context to the connection pool', async () => {
    await runInTenant(application, firstOrganizationId, (transaction) =>
      transaction.project.findMany(),
    );

    await expect(application.project.findMany()).resolves.toEqual([]);
  });

  it('stores test results in monthly partitions from the initial migration', async () => {
    const partitions = await admin.$queryRaw<Array<{ partition: string }>>`
      SELECT child.relname AS partition
      FROM pg_inherits
      JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
      JOIN pg_class child ON pg_inherits.inhrelid = child.oid
      WHERE parent.relname = 'test_results'
      ORDER BY child.relname
    `;

    expect(partitions.map(({ partition }) => partition)).toEqual([
      'test_results_2026_08',
      'test_results_2026_09',
      'test_results_default',
    ]);
  });
});
