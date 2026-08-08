import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../../generated/prisma/client';
import { createPrismaClient } from '../../infrastructure/prisma/prisma-client';
import { runInTenant } from '../../application/services/tenant-database.service';

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
    await admin.auditLog.deleteMany({
      where: { organizationId: { in: [firstOrganizationId, secondOrganizationId] } },
    });
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

  it('allows appending audit events but forbids changing or deleting them', async () => {
    const auditLogId = randomUUID();
    await runInTenant(application, firstOrganizationId, (transaction) =>
      transaction.auditLog.create({
        data: {
          organizationId: firstOrganizationId,
          id: auditLogId,
          actorId: randomUUID(),
          actorType: 'system',
          action: 'test.audit_appended',
          targetType: 'rls_test',
          targetId: null,
        },
      }),
    );

    await expect(
      runInTenant(application, firstOrganizationId, (transaction) =>
        transaction.auditLog.updateMany({
          where: { organizationId: firstOrganizationId, id: auditLogId },
          data: { action: 'test.audit_changed' },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      runInTenant(application, firstOrganizationId, (transaction) =>
        transaction.auditLog.deleteMany({
          where: { organizationId: firstOrganizationId, id: auditLogId },
        }),
      ),
    ).rejects.toThrow();

    await expect(
      runInTenant(application, firstOrganizationId, (transaction) =>
        transaction.auditLog.findMany({ where: { id: auditLogId }, select: { action: true } }),
      ),
    ).resolves.toEqual([{ action: 'test.audit_appended' }]);
    await expect(
      runInTenant(application, secondOrganizationId, (transaction) =>
        transaction.auditLog.findMany({ where: { id: auditLogId } }),
      ),
    ).resolves.toEqual([]);
  });

  it('enforces the tenant RLS policy on every table with organization_id', async () => {
    const tables = await admin.$queryRaw<
      Array<{
        tableName: string;
        rowSecurity: boolean;
        forceRowSecurity: boolean;
        hasTenantPolicy: boolean;
      }>
    >`
      SELECT
        relation.relname AS "tableName",
        relation.relrowsecurity AS "rowSecurity",
        relation.relforcerowsecurity AS "forceRowSecurity",
        EXISTS (
          SELECT 1
          FROM pg_policy AS policy
          WHERE policy.polrelid = relation.oid
            AND policy.polname = 'tenant_isolation'
            AND pg_get_expr(policy.polqual, policy.polrelid) LIKE '%current_organization_id%'
            AND pg_get_expr(policy.polwithcheck, policy.polrelid) LIKE '%current_organization_id%'
        ) AS "hasTenantPolicy"
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
        AND EXISTS (
          SELECT 1
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = relation.oid
            AND attribute.attname = 'organization_id'
            AND NOT attribute.attisdropped
        )
      ORDER BY relation.relname
    `;

    expect(tables.length).toBeGreaterThan(20);
    expect(
      tables.filter(
        ({ rowSecurity, forceRowSecurity, hasTenantPolicy }) =>
          !rowSecurity || !forceRowSecurity || !hasTenantPolicy,
      ),
    ).toEqual([]);
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
