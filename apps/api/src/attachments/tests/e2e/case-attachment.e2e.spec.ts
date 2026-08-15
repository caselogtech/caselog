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
import { StorageMaintenanceService } from '../../application/services/storage-maintenance.service';
import { StorageMaintenanceRepository } from '../../infrastructure/repositories/storage-maintenance.repository';

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
        admin.attachmentBlob.findMany({
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
      await admin.attachmentBlob.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
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
      await admin.usageCounter.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
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

  it('stores identical attachment bytes once while keeping separate references', async () => {
    const usageBefore = await storageBytesUsed();
    const content = 'shared content-addressed evidence';
    const body = Buffer.from(content);
    const checksumSha256 = createHash('sha256').update(content).digest('hex');
    const [firstUpload, secondUpload] = await Promise.all([
      createUploadSession('first-name.txt', body),
      createUploadSession('second-name.txt', body),
    ]);
    const stored = await Promise.all(
      [firstUpload, secondUpload].map(({ upload }) =>
        fetch(upload.url, { method: 'PUT', headers: upload.headers, body }),
      ),
    );
    expect(stored.map(({ status }) => status)).toEqual([200, 200]);
    const completed = await Promise.all(
      [firstUpload, secondUpload].map(({ upload }) =>
        app.inject({
          method: 'POST',
          url: attachmentCollectionUrl(caseId, versionId),
          headers: authorizationHeader(),
          payload: { uploadId: upload.id },
        }),
      ),
    );
    expect(completed.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
    const [first, second] = completed.map((response) =>
      caseAttachmentResponseSchema.parse(response.json()),
    );
    if (!first || !second) throw new Error('Attachment responses disappeared');

    expect(first.attachment.id).not.toBe(second.attachment.id);
    expect(first.attachment.fileName).toBe('first-name.txt');
    expect(second.attachment.fileName).toBe('second-name.txt');
    await expect(
      admin.attachmentBlob.findUnique({
        where: { organizationId_checksumSha256: { organizationId, checksumSha256 } },
      }),
    ).resolves.toMatchObject({ activeReferenceCount: 2 });
    await expect(
      admin.attachment.count({ where: { organizationId, checksumSha256, deletedAt: null } }),
    ).resolves.toBe(2);
    await expect(storageBytesUsed()).resolves.toBe(usageBefore + BigInt(body.byteLength));

    const storage = app.get<StorageProvider>(STORAGE_PROVIDER);
    const objects = await storage.list(
      `${organizationId}/blobs/sha256/${checksumSha256.slice(0, 2)}/${checksumSha256}`,
      null,
      10,
    );
    expect(objects.objects).toHaveLength(1);
  });

  it('completes the same upload concurrently without duplicating the attachment', async () => {
    const usageBefore = await storageBytesUsed();
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
    await expect(storageBytesUsed()).resolves.toBe(usageBefore + BigInt(body.byteLength));
  });

  it('keeps storage usage consistent across soft delete, restore, and hard delete', async () => {
    const usageBefore = await storageBytesUsed();
    const content = 'storage accounting lifecycle';
    const uploaded = await uploadAttachment('accounting.txt', content);
    const attachmentId = uploaded.response.attachment.id;
    const sizeBytes = BigInt(Buffer.byteLength(content));

    await expect(storageBytesUsed()).resolves.toBe(usageBefore + sizeBytes);

    await admin.attachment.update({
      where: { organizationId_id: { organizationId, id: attachmentId } },
      data: { deletedAt: new Date() },
    });
    await expect(storageBytesUsed()).resolves.toBe(usageBefore);

    await admin.attachment.update({
      where: { organizationId_id: { organizationId, id: attachmentId } },
      data: { deletedAt: null },
    });
    await expect(storageBytesUsed()).resolves.toBe(usageBefore + sizeBytes);

    await admin.attachment.delete({
      where: { organizationId_id: { organizationId, id: attachmentId } },
    });
    await expect(storageBytesUsed()).resolves.toBe(usageBefore);
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

  it('cleans expired uploads, reconciles S3 health, and repairs physical usage', async () => {
    const storage = app.get<StorageProvider>(STORAGE_PROVIDER);
    const maintenance = app.get(StorageMaintenanceService);
    const usageBefore = await storageBytesUsed();

    const missingId = randomUUID();
    const missingChecksum = 'a'.repeat(64);
    const missingKey = `${organizationId}/blobs/sha256/aa/${missingChecksum}`;
    await admin.attachmentBlob.create({
      data: {
        organizationId,
        checksumSha256: missingChecksum,
        storageKey: missingKey,
        sizeBytes: 50n,
      },
    });
    await admin.attachment.create({
      data: {
        organizationId,
        id: missingId,
        targetType: 'CASE_VERSION',
        targetId: versionId,
        fileName: 'missing.txt',
        contentType: 'text/plain',
        sizeBytes: 50n,
        checksumSha256: missingChecksum,
      },
    });

    const mismatchId = randomUUID();
    const mismatchBody = Buffer.from('physical mismatch');
    const mismatchKey = `${organizationId}/cases/${caseId}/versions/${versionId}/attachments/${mismatchId}`;
    const mismatchChecksum = createHash('sha256').update(mismatchBody).digest('hex');
    const mismatchUpload = await storage.createUploadUrl({
      storageKey: mismatchKey,
      contentType: 'text/plain',
      sizeBytes: mismatchBody.byteLength,
      checksumSha256: mismatchChecksum,
    });
    const mismatchStored = await fetch(mismatchUpload.url, {
      method: 'PUT',
      headers: mismatchUpload.headers,
      body: mismatchBody,
    });
    expect(mismatchStored.status, await mismatchStored.text()).toBe(200);
    const expectedMismatchChecksum = 'b'.repeat(64);
    await admin.attachmentBlob.create({
      data: {
        organizationId,
        checksumSha256: expectedMismatchChecksum,
        storageKey: mismatchKey,
        sizeBytes: 75n,
      },
    });
    await admin.attachment.create({
      data: {
        organizationId,
        id: mismatchId,
        targetType: 'CASE_VERSION',
        targetId: versionId,
        fileName: 'mismatch.txt',
        contentType: 'text/plain',
        sizeBytes: 75n,
        checksumSha256: expectedMismatchChecksum,
      },
    });

    const expiredBody = Buffer.from('expired upload');
    const expired = await createUploadSession('expired.txt', expiredBody);
    const expiredStorageKey = `${organizationId}/cases/${caseId}/versions/${versionId}/uploads/${expired.upload.id}`;
    const expiredStored = await fetch(expired.upload.url, {
      method: 'PUT',
      headers: expired.upload.headers,
      body: expiredBody,
    });
    expect(expiredStored.status, await expiredStored.text()).toBe(200);
    await admin.uploadSession.update({
      where: { organizationId_id: { organizationId, id: expired.upload.id } },
      data: {
        createdAt: new Date(Date.now() - 7_200_000),
        expiresAt: new Date(Date.now() - 3_600_000),
      },
    });

    await admin.usageCounter.update({
      where: { organizationId },
      data: { storageBytesUsed: usageBefore + 1_000n },
    });
    await admin.attachmentBlob.update({
      where: {
        organizationId_checksumSha256: {
          organizationId,
          checksumSha256: expectedMismatchChecksum,
        },
      },
      data: { activeReferenceCount: 0 },
    });
    const summary = await maintenance.maintainOrganization(organizationId);

    expect(summary.expiredUploadsDeleted).toBe(1);
    expect(summary.blobsMissing).toBeGreaterThanOrEqual(1);
    expect(summary.blobsMismatched).toBeGreaterThanOrEqual(1);
    await expect(
      admin.uploadSession.findUnique({
        where: { organizationId_id: { organizationId, id: expired.upload.id } },
      }),
    ).resolves.toBeNull();
    await expect(storage.stat(expiredStorageKey)).resolves.toBeNull();
    await expect(
      admin.attachmentBlob.findUnique({
        where: {
          organizationId_checksumSha256: {
            organizationId,
            checksumSha256: missingChecksum,
          },
        },
      }),
    ).resolves.toMatchObject({
      storageStatus: 'MISSING',
      storageObservedSizeBytes: null,
      storageCheckedAt: expect.any(Date),
    });
    await expect(
      admin.attachmentBlob.findUnique({
        where: {
          organizationId_checksumSha256: {
            organizationId,
            checksumSha256: expectedMismatchChecksum,
          },
        },
      }),
    ).resolves.toMatchObject({
      storageStatus: 'MISMATCH',
      storageObservedSizeBytes: BigInt(mismatchBody.byteLength),
      storageCheckedAt: expect.any(Date),
      activeReferenceCount: 1,
    });
    await expect(storageBytesUsed()).resolves.toBe(usageBefore + BigInt(mismatchBody.byteLength));
  });

  it('serializes counter repair with concurrent attachment writes', async () => {
    const repository = app.get(StorageMaintenanceRepository);
    const usageBefore = await storageBytesUsed();
    const attachments = Array.from({ length: 20 }, (_, index) => {
      const checksumSha256 = createHash('sha256').update(`concurrency-${index}`).digest('hex');
      return { id: randomUUID(), sizeBytes: BigInt(index + 1), checksumSha256 };
    });
    await admin.attachmentBlob.createMany({
      data: attachments.map(({ checksumSha256, sizeBytes }) => ({
        organizationId,
        checksumSha256,
        storageKey: `${organizationId}/blobs/sha256/${checksumSha256.slice(0, 2)}/${checksumSha256}`,
        sizeBytes,
        storageObservedSizeBytes: sizeBytes,
      })),
    });

    await Promise.all([
      ...attachments.map(({ id, sizeBytes, checksumSha256 }) =>
        admin.attachment.create({
          data: {
            organizationId,
            id,
            targetType: 'CASE_VERSION',
            targetId: versionId,
            fileName: `${id}.txt`,
            contentType: 'text/plain',
            sizeBytes,
            checksumSha256,
          },
        }),
      ),
      ...Array.from({ length: 10 }, () => repository.repairUsageCounter(organizationId)),
    ]);

    const addedBytes = attachments.reduce((total, { sizeBytes }) => total + sizeBytes, 0n);
    await repository.repairUsageCounter(organizationId);
    await expect(storageBytesUsed()).resolves.toBe(usageBefore + addedBytes);
    await admin.attachment.deleteMany({
      where: { organizationId, id: { in: attachments.map(({ id }) => id) } },
    });
    await expect(storageBytesUsed()).resolves.toBe(usageBefore);
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

  async function storageBytesUsed(): Promise<bigint> {
    const counter = await admin.usageCounter.findUnique({ where: { organizationId } });
    return counter?.storageBytesUsed ?? 0n;
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
