import { randomUUID } from 'node:crypto';
import {
  csvImportPreviewResponseSchema,
  csvImportResponseSchema,
  sessionResponseSchema,
} from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';

const PASSWORD = 'correct horse battery staple';

describe('CSV test case imports', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let email = '';
  let organizationId = '';
  let foreignOrganizationId = '';
  let organizationToken = '';
  let sectionId = '';
  let foreignSectionId = '';

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) throw new Error('MIGRATION_DATABASE_URL is required for CSV import tests');
    admin = createPrismaClient(adminUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    email = `csv-import-${suffix}@example.com`;
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { displayName: 'CSV Owner', email, password: PASSWORD, termsAccepted: true },
    });
    const session = sessionResponseSchema.parse(registration.json());
    const user = await admin.user.findUniqueOrThrow({ where: { email } });

    const organization = await admin.organization.create({
      data: { name: 'CSV Workspace', slug: `csv-${suffix}` },
    });
    organizationId = organization.id;
    await admin.membership.create({
      data: { organizationId, userId: user.id, role: 'OWNER' },
    });
    const project = await admin.project.create({
      data: { organizationId, key: 'CSV', slug: 'csv-import', name: 'CSV Import' },
    });
    const suite = await admin.suite.create({
      data: { organizationId, projectId: project.id, name: 'Imported' },
    });
    const section = await admin.section.create({
      data: {
        organizationId,
        projectId: project.id,
        suiteId: suite.id,
        name: 'Imported cases',
        path: `/${randomUUID()}`,
        depth: 0,
      },
    });
    sectionId = section.id;

    const foreignOrganization = await admin.organization.create({
      data: { name: 'Foreign CSV Workspace', slug: `foreign-csv-${suffix}` },
    });
    foreignOrganizationId = foreignOrganization.id;
    const foreignProject = await admin.project.create({
      data: {
        organizationId: foreignOrganizationId,
        key: 'FOREIGN',
        slug: 'foreign-only',
        name: 'Foreign',
      },
    });
    const foreignSuite = await admin.suite.create({
      data: {
        organizationId: foreignOrganizationId,
        projectId: foreignProject.id,
        name: 'Foreign',
      },
    });
    const foreignSection = await admin.section.create({
      data: {
        organizationId: foreignOrganizationId,
        projectId: foreignProject.id,
        suiteId: foreignSuite.id,
        name: 'Foreign section',
        path: `/${randomUUID()}`,
        depth: 0,
      },
    });
    foreignSectionId = foreignSection.id;

    const token = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${organization.slug}/token`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    organizationToken = token.json().accessToken as string;
  });

  afterAll(async () => {
    if (admin) {
      const organizationIds = [organizationId, foreignOrganizationId].filter(Boolean);
      await admin.testCase.updateMany({
        where: { organizationId: { in: organizationIds } },
        data: { currentVersionId: null },
      });
      await admin.testCaseVersion.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await admin.testCase.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.idempotencyRecord.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await admin.section.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.suite.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.project.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.membership.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.organization.deleteMany({ where: { id: { in: organizationIds } } });
      await admin.user.deleteMany({ where: { email } });
      await admin.$disconnect();
    }
    if (app) await app.close();
  });

  it('previews valid rows and reports row-level and tenant-safe section errors', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/csv-import/imports/csv/preview',
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: {
        csv: `Title,Section,Template,Content\n"Card, checkout",${sectionId},TEXT,"Pay by card"\n,${sectionId},text,Missing title\nForeign,${foreignSectionId},text,Hidden section`,
        mapping: {
          title: 'Title',
          sectionId: 'Section',
          template: 'Template',
          content: 'Content',
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const preview = csvImportPreviewResponseSchema.parse(response.json());
    expect(preview.summary).toEqual({ total: 3, valid: 1, invalid: 2 });
    expect(preview.rows[0]?.value?.title).toBe('Card, checkout');
    expect(preview.rows[2]?.issues).toContainEqual({
      field: 'sectionId',
      message: 'Section does not exist in this project',
    });
  });

  it('imports atomically and replays the same idempotency key', async () => {
    const request = {
      csv: 'Title,Automation,Content\nLogin,auth.login,Open form => Form opens\nLogout,auth.logout,Sign out => Session ends',
      mapping: { title: 'Title', automationId: 'Automation', content: 'Content' },
      defaults: { sectionId, template: 'steps' as const },
    };
    const headers = {
      authorization: `Bearer ${organizationToken}`,
      'idempotency-key': 'csv-import-success',
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/csv-import/imports/csv/commit',
      headers,
      payload: request,
    });
    expect(first.statusCode, first.body).toBe(201);
    const imported = csvImportResponseSchema.parse(first.json());
    expect(imported.imported).toBe(2);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/csv-import/imports/csv/commit',
      headers,
      payload: request,
    });
    expect(replay.statusCode, replay.body).toBe(201);
    expect(csvImportResponseSchema.parse(replay.json())).toEqual(imported);
    await expect(
      admin.testCase.count({ where: { organizationId, project: { slug: 'csv-import' } } }),
    ).resolves.toBe(2);

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/csv-import/imports/csv/commit',
      headers,
      payload: { ...request, csv: 'Title,Automation,Content\nDifferent,new.case,Body' },
    });
    expect(conflict.statusCode, conflict.body).toBe(409);
  });

  it('does not write a partially invalid import', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/csv-import/imports/csv/commit',
      headers: {
        authorization: `Bearer ${organizationToken}`,
        'idempotency-key': 'csv-import-invalid',
      },
      payload: {
        csv: 'Title,Content\nValid,Body\n,Invalid',
        mapping: { title: 'Title', content: 'Content' },
        defaults: { sectionId, template: 'text' },
      },
    });

    expect(response.statusCode, response.body).toBe(400);
    await expect(admin.testCase.count({ where: { organizationId } })).resolves.toBe(2);
  });

  it('accepts CSV preview payloads larger than Fastify default body limit', async () => {
    const content = 'x'.repeat(45_000);
    const csv = [
      'Title,Content',
      ...Array.from({ length: 25 }, (_, index) => `Case ${index},${content}`),
    ].join('\n');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/csv-import/imports/csv/preview',
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: {
        csv,
        mapping: { title: 'Title', content: 'Content' },
        defaults: { sectionId, template: 'text' },
      },
    });

    expect(response.statusCode, response.body.slice(0, 500)).toBe(200);
    expect(csvImportPreviewResponseSchema.parse(response.json()).summary).toEqual({
      total: 25,
      valid: 25,
      invalid: 0,
    });
  });

  it('hides projects owned by another tenant', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/foreign-only/imports/csv/preview',
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: {
        csv: 'Title,Content\nHidden,Body',
        mapping: { title: 'Title', content: 'Content' },
        defaults: { sectionId, template: 'text' },
      },
    });
    expect(response.statusCode).toBe(404);
  });
});
