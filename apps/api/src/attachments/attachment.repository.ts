import { Inject, Injectable } from '@nestjs/common';
import type { CreateUploadSessionRequest } from '@caselog/schemas';
import { TenantDatabaseService } from '../core/database/tenant-database.service';
import { AttachmentTargetType, RunStatus } from '../generated/prisma/enums';

const MAX_PENDING_UPLOADS_PER_USER = 20;
const MAX_PENDING_STORAGE_BYTES = 500n * 1_024n * 1_024n;

export type CreateUploadRecord = {
  id: string;
  storageKey: string;
  expiresAt: Date;
};

export type CreateUploadResult =
  | { kind: 'created' }
  | { kind: 'project_not_found' }
  | { kind: 'run_not_found' }
  | { kind: 'item_not_found' }
  | { kind: 'run_closed' }
  | { kind: 'invalid_step_position' }
  | { kind: 'upload_limit_reached' };

export type PendingUploadSession = {
  id: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  stepPosition: number | null;
};

export type DownloadableAttachment = { storageKey: string; fileName: string };

@Injectable()
export class AttachmentRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async findResultAttachment(
    organizationId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    resultId: string,
    attachmentId: string,
  ): Promise<DownloadableAttachment | null> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return null;
      const run = await transaction.testRun.findUnique({
        where: {
          organizationId_id: { organizationId, id: runId },
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!run) return null;
      const item = await transaction.testRunItem.findUnique({
        where: { organizationId_id: { organizationId, id: itemId }, testRunId: run.id },
        select: { id: true },
      });
      if (!item) return null;
      const result = await transaction.testResult.findFirst({
        where: { id: resultId, testRunItemId: item.id },
        select: { id: true },
      });
      if (!result) return null;
      return transaction.attachment.findFirst({
        where: {
          id: attachmentId,
          targetType: AttachmentTargetType.RESULT,
          targetId: result.id,
          deletedAt: null,
        },
        select: { storageKey: true, fileName: true },
      });
    });
  }

  async findPendingUploadSessions(
    organizationId: string,
    userId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    uploadIds: string[],
  ): Promise<PendingUploadSession[] | null> {
    if (uploadIds.length === 0) return [];
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const uploads = await transaction.uploadSession.findMany({
        where: {
          id: { in: uploadIds },
          createdById: userId,
          testRunId: runId,
          testRunItemId: itemId,
          completedAt: null,
          expiresAt: { gt: new Date() },
          project: { slug: projectSlug, deletedAt: null },
        },
        select: {
          id: true,
          storageKey: true,
          fileName: true,
          contentType: true,
          sizeBytes: true,
          checksumSha256: true,
          stepPosition: true,
        },
      });
      if (uploads.length !== uploadIds.length) return null;
      const uploadById = new Map(uploads.map((upload) => [upload.id, upload]));
      return uploadIds.map((id) => {
        const upload = uploadById.get(id);
        if (!upload) throw new Error('Pending upload disappeared during lookup');
        return { ...upload, sizeBytes: Number(upload.sizeBytes) };
      });
    });
  }

  async createUploadSession(
    organizationId: string,
    userId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    request: CreateUploadSessionRequest,
    record: CreateUploadRecord,
  ): Promise<CreateUploadResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      await transaction.$queryRaw`
        SELECT id FROM organizations
        WHERE id = ${organizationId}::uuid
        FOR UPDATE
      `;
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const run = await transaction.testRun.findUnique({
        where: {
          organizationId_id: { organizationId, id: runId },
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true, status: true },
      });
      if (!run) return { kind: 'run_not_found' };
      if (run.status !== RunStatus.ACTIVE) return { kind: 'run_closed' };
      const item = await transaction.testRunItem.findUnique({
        where: { organizationId_id: { organizationId, id: itemId }, testRunId: run.id },
        select: { id: true, caseVersion: { select: { template: true, content: true } } },
      });
      if (!item) return { kind: 'item_not_found' };
      if (request.stepPosition !== undefined) {
        const content = item.caseVersion.content as { steps?: unknown[] };
        const stepCount = item.caseVersion.template === 'STEPS' ? (content.steps?.length ?? 0) : 0;
        if (request.stepPosition >= stepCount) return { kind: 'invalid_step_position' };
      }
      const now = new Date();
      const [userPendingCount, pendingStorage] = await Promise.all([
        transaction.uploadSession.count({
          where: { createdById: userId, completedAt: null, expiresAt: { gt: now } },
        }),
        transaction.uploadSession.aggregate({
          where: { completedAt: null, expiresAt: { gt: now } },
          _sum: { sizeBytes: true },
        }),
      ]);
      if (
        userPendingCount >= MAX_PENDING_UPLOADS_PER_USER ||
        (pendingStorage._sum.sizeBytes ?? 0n) + BigInt(request.sizeBytes) >
          MAX_PENDING_STORAGE_BYTES
      ) {
        return { kind: 'upload_limit_reached' };
      }
      await transaction.uploadSession.create({
        data: {
          organizationId,
          id: record.id,
          projectId: project.id,
          testRunId: run.id,
          testRunItemId: item.id,
          createdById: userId,
          storageKey: record.storageKey,
          fileName: request.fileName,
          contentType: request.contentType,
          sizeBytes: BigInt(request.sizeBytes),
          checksumSha256: request.checksumSha256,
          stepPosition: request.stepPosition,
          expiresAt: record.expiresAt,
        },
      });
      return { kind: 'created' };
    });
  }
}
