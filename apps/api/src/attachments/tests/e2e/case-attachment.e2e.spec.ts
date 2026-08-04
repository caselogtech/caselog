import { createHash, randomUUID } from 'node:crypto';
import {
  caseAttachmentListResponseSchema,
  caseAttachmentResponseSchema,
  createUploadSessionResponseSchema,
  sessionResponseSchema,
} from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/application/ports/storage.provider';
import type { PrismaClient } from '../../../generated/prisma/client';

const PASSWORD = 'correct horse battery staple';

describe('case attachments', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let organizationId = '';
  let foreignOrganizationId = '';
  let organizationToken = '';
  let readOnlyToken = '';
  let email = '';
  let readOnlyEmail = '';
  let caseId = '';
  let versionId = '';
  let foreignCaseId = '';
  let foreignVersionId = '';

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) throw new Error('MIGRATION_DATABASE_URL is required for attachment tests');
    admin = createPrismaClient(adminUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    email = `case-attachment-${suffix}@example.com`;
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: 'Attachment Owner',
        email,
        password: PASSWORD,
        termsAccepted: true,
      },
    });
    const session = sessionResponseSchema.parse(registration.json());
    const user = await admin.user.findUniqueOrThrow({ where: { email } });

    const primary = await createCaseFixture(admin, user.id, `attachment-${suffix}`, true);
    organizationId = primary.organizationId;
    caseId = primary.caseId;
    versionId = primary.versionId;
    const foreign = await createCaseFixture(admin, user.id, `foreign-attachment-${suffix}`, false);
    foreignOrganizationId = foreign.organizationId;
    foreignCaseId = foreign.caseId;
    foreignVersionId = foreign.versionId;

    const organizationSession = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${primary.organizationSlug}/token`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(organizationSession.statusCode, organizationSession.body).toBe(200);
    organizationToken = organizationSession.json().accessToken as string;

    readOnlyEmail = `case-attachment-reader-${suffix}@example.com`;
    const readOnlyRegistration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: 'Attachment Reader',
        email: readOnlyEmail,
        password: PASSWORD,
        termsAccepted: true,
      },
    });
    const readOnlySession = sessionResponseSchema.parse(readOnlyRegistration.json());
    const readOnlyUser = await admin.user.findUniqueOrThrow({ where: { email: readOnlyEmail } });
    await admin.membership.create({
      data: { organizationId, userId: readOnlyUser.id, role: 'READ_ONLY' },
    });
    const readOnlyOrganizationSession = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${primary.organizationSlug}/token`,
      headers: { authorization: `Bearer ${readOnlySession.accessToken}` },
    });
    expect(readOnlyOrganizationSession.statusCode, readOnlyOrganizationSession.body).toBe(200);
    readOnlyToken = readOnlyOrganizationSession.json().accessToken as string;
  });

  afterAll(async () => {
    if (admin) {
      const organizationIds = [organizationId, foreignOrganizationId].filter(Boolean);
      const [attachments, uploads] = await Promise.all([
        admin.attachment.findMany({
          where: { organizationId: { in: organizationIds } },
          select: { storageKey: true },
        }),
        admin.uploadSession.findMany({
          where: { organizationId: { in: organizationIds } },
          select: { storageKey: true },
        }),
      ]);
      const storage = app.get<StorageProvider>(STORAGE_PROVIDER);
      await Promise.allSettled(
        [...attachments, ...uploads].map(({ storageKey }) => storage.delete(storageKey)),
      );
      await admin.attachment.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.uploadSession.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await admin.testCase.updateMany({
        where: { organizationId: { in: organizationIds } },
        data: { currentVersionId: null },
      });
      await admin.testCaseVersion.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await admin.testCase.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.section.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.suite.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.project.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.membership.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.organization.deleteMany({ where: { id: { in: organizationIds } } });
      await admin.user.deleteMany({ where: { email: { in: [email, readOnlyEmail] } } });
      await admin.$disconnect();
    }
    if (app) await app.close();
  });

  it('promotes, lists, paginates, downloads, and idempotently replays case attachments', async () => {
    const first = await uploadAttachment('evidence-one.txt', 'first case attachment');
    const replay = await app.inject({
      method: 'POST',
      url: attachmentCollectionUrl(caseId, versionId),
      headers: authorizationHeader(),
      payload: { uploadId: first.uploadId },
    });
    expect(replay.statusCode, replay.body).toBe(201);
    expect(caseAttachmentResponseSchema.parse(replay.json())).toEqual(first.response);

    const second = await uploadAttachment('evidence-two.txt', 'second case attachment');
    const firstPageResponse = await app.inject({
      method: 'GET',
      url: `${attachmentCollectionUrl(caseId, versionId)}?limit=1`,
      headers: authorizationHeader(),
    });
    expect(firstPageResponse.statusCode, firstPageResponse.body).toBe(200);
    const firstPage = caseAttachmentListResponseSchema.parse(firstPageResponse.json());
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBe(firstPage.items[0]?.id);

    const secondPageResponse = await app.inject({
      method: 'GET',
      url: `${attachmentCollectionUrl(caseId, versionId)}?limit=1&cursor=${firstPage.nextCursor}`,
      headers: authorizationHeader(),
    });
    expect(secondPageResponse.statusCode, secondPageResponse.body).toBe(200);
    const secondPage = caseAttachmentListResponseSchema.parse(secondPageResponse.json());
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect(new Set([...firstPage.items, ...secondPage.items].map(({ id }) => id))).toEqual(
      new Set([first.response.attachment.id, second.response.attachment.id]),
    );

    const download = await app.inject({
      method: 'POST',
      url: `${attachmentCollectionUrl(caseId, versionId)}/${first.response.attachment.id}/download`,
      headers: authorizationHeader(),
    });
    expect(download.statusCode, download.body).toBe(201);
    const downloaded = await fetch(download.json().download.url as string);
    const downloadedBody = await downloaded.text();
    expect(downloaded.status, downloadedBody).toBe(200);
    expect(downloadedBody).toBe('first case attachment');

    await expect(
      admin.uploadSession.findUnique({
        where: { organizationId_id: { organizationId, id: first.uploadId } },
      }),
    ).resolves.toMatchObject({
      testRunId: null,
      testRunItemId: null,
      caseVersionId: versionId,
      completedAt: expect.any(Date),
    });
    await expect(
      admin.attachment.findFirst({
        where: { organizationId, id: first.response.attachment.id },
      }),
    ).resolves.toMatchObject({ targetType: 'CASE_VERSION', targetId: versionId });
  });

  it('rejects completion when the uploaded object is missing', async () => {
    const body = Buffer.from('missing object');
    const upload = await createUploadSession('missing.txt', body);
    const completion = await app.inject({
      method: 'POST',
      url: attachmentCollectionUrl(caseId, versionId),
      headers: authorizationHeader(),
      payload: { uploadId: upload.upload.id },
    });
    expect(completion.statusCode, completion.body).toBe(409);
    expect(completion.json().error).toMatchObject({ code: 'upload_incomplete' });
  });

  it('completes the same upload concurrently without duplicating the attachment', async () => {
    const body = Buffer.from('concurrent case attachment');
    const upload = await createUploadSession('concurrent.txt', body);
    const stored = await fetch(upload.upload.url, {
      method: 'PUT',
      headers: upload.upload.headers,
      body,
    });
    expect(stored.status, await stored.text()).toBe(200);
    const complete = () =>
      app.inject({
        method: 'POST',
        url: attachmentCollectionUrl(caseId, versionId),
        headers: authorizationHeader(),
        payload: { uploadId: upload.upload.id },
      });

    const responses = await Promise.all([complete(), complete()]);
    expect(responses.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
    expect(responses[0]?.json()).toEqual(responses[1]?.json());
    await expect(
      admin.attachment.count({ where: { organizationId, id: upload.upload.id } }),
    ).resolves.toBe(1);
  });

  it('hides case attachment endpoints across tenant boundaries', async () => {
    const create = await app.inject({
      method: 'POST',
      url: uploadCollectionUrl(foreignCaseId, foreignVersionId),
      headers: authorizationHeader(),
      payload: uploadRequest('foreign.txt', Buffer.from('foreign')),
    });
    expect(create.statusCode, create.body).toBe(404);

    const list = await app.inject({
      method: 'GET',
      url: attachmentCollectionUrl(foreignCaseId, foreignVersionId),
      headers: authorizationHeader(),
    });
    expect(list.statusCode, list.body).toBe(404);
  });

  it('allows read-only members to view but not create case attachments', async () => {
    const list = await app.inject({
      method: 'GET',
      url: attachmentCollectionUrl(caseId, versionId),
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    expect(list.statusCode, list.body).toBe(200);

    const create = await app.inject({
      method: 'POST',
      url: uploadCollectionUrl(caseId, versionId),
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: uploadRequest('forbidden.txt', Buffer.from('forbidden')),
    });
    expect(create.statusCode, create.body).toBe(403);
    expect(create.json().error).toMatchObject({ code: 'insufficient_permissions' });
  });

  function authorizationHeader(): { authorization: string } {
    return { authorization: `Bearer ${organizationToken}` };
  }

  function attachmentCollectionUrl(targetCaseId: string, targetVersionId: string): string {
    return `${caseVersionUrl(targetCaseId, targetVersionId)}/attachments`;
  }

  function uploadCollectionUrl(targetCaseId: string, targetVersionId: string): string {
    return `${caseVersionUrl(targetCaseId, targetVersionId)}/uploads`;
  }

  function caseVersionUrl(targetCaseId: string, targetVersionId: string): string {
    return `/api/v1/projects/attachments/cases/${targetCaseId}/versions/${targetVersionId}`;
  }

  async function createUploadSession(fileName: string, body: Buffer) {
    const response = await app.inject({
      method: 'POST',
      url: uploadCollectionUrl(caseId, versionId),
      headers: authorizationHeader(),
      payload: uploadRequest(fileName, body),
    });
    expect(response.statusCode, response.body).toBe(201);
    return createUploadSessionResponseSchema.parse(response.json());
  }

  async function uploadAttachment(fileName: string, content: string) {
    const body = Buffer.from(content);
    const upload = await createUploadSession(fileName, body);
    const stored = await fetch(upload.upload.url, {
      method: 'PUT',
      headers: upload.upload.headers,
      body,
    });
    expect(stored.status, await stored.text()).toBe(200);
    const completion = await app.inject({
      method: 'POST',
      url: attachmentCollectionUrl(caseId, versionId),
      headers: authorizationHeader(),
      payload: { uploadId: upload.upload.id },
    });
    expect(completion.statusCode, completion.body).toBe(201);
    return {
      uploadId: upload.upload.id,
      response: caseAttachmentResponseSchema.parse(completion.json()),
    };
  }
});

function uploadRequest(fileName: string, body: Buffer) {
  return {
    fileName,
    contentType: 'text/plain',
    sizeBytes: body.byteLength,
    checksumSha256: createHash('sha256').update(body).digest('hex'),
  };
}

async function createCaseFixture(
  admin: PrismaClient,
  userId: string,
  organizationSlug: string,
  createMembership: boolean,
) {
  const organization = await admin.organization.create({
    data: { name: 'Attachment Workspace', slug: organizationSlug },
  });
  if (createMembership) {
    await admin.membership.create({
      data: { organizationId: organization.id, userId, role: 'OWNER' },
    });
  }
  const project = await admin.project.create({
    data: {
      organizationId: organization.id,
      key: 'ATTACH',
      slug: 'attachments',
      name: 'Attachment Project',
    },
  });
  const suite = await admin.suite.create({
    data: { organizationId: organization.id, projectId: project.id, name: 'Evidence' },
  });
  const section = await admin.section.create({
    data: {
      organizationId: organization.id,
      projectId: project.id,
      suiteId: suite.id,
      name: 'Case evidence',
      path: `/${randomUUID()}`,
      depth: 0,
    },
  });
  const testCase = await admin.testCase.create({
    data: {
      organizationId: organization.id,
      projectId: project.id,
      suiteId: suite.id,
      sectionId: section.id,
      caseNumber: 1n,
    },
  });
  const version = await admin.testCaseVersion.create({
    data: {
      organizationId: organization.id,
      testCaseId: testCase.id,
      version: 1,
      title: 'Attach evidence',
      template: 'STEPS',
      content: { steps: [{ action: 'Upload evidence' }] },
      createdById: userId,
    },
  });
  await admin.testCase.update({
    where: { organizationId_id: { organizationId: organization.id, id: testCase.id } },
    data: { currentVersionId: version.id },
  });
  return {
    organizationId: organization.id,
    organizationSlug: organization.slug,
    caseId: testCase.id,
    versionId: version.id,
  };
}
