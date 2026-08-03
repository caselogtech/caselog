import { Inject, Injectable } from '@nestjs/common';
import type { CreateUploadSessionRequest } from '@caselog/schemas';
import { TenantDatabaseService } from '../core/database/tenant-database.service';
import { RunStatus } from '../generated/prisma/enums';

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

@Injectable()
export class AttachmentRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

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
