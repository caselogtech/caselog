import { Inject, Injectable } from '@nestjs/common';
import type {
  CaseAttachment,
  CompleteCaseAttachmentRequest,
  CreateCaseAttachmentUploadSessionRequest,
} from '@caselog/schemas';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../../core/database/application/services/tenant-database.service';
import { AttachmentTargetType } from '../../../generated/prisma/enums';
import {
  caseAttachmentSelect,
  findCaseVersionAttachmentContext,
  toCaseAttachment,
} from '../persistence/case-attachment.persistence';
import { hasPendingUploadCapacity } from '../persistence/upload-quota.persistence';
import type {
  CaseAttachmentResult,
  CaseAttachmentUploadLookup,
  PendingCaseAttachmentUpload,
} from './case-attachment.types';

export type CreateCaseUploadRecord = {
  id: string;
  storageKey: string;
  expiresAt: Date;
};

export type CompleteCaseUploadRecord = {
  storageKey: string;
  upload: PendingCaseAttachmentUpload;
};

@Injectable()
export class CaseAttachmentUploadRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    request: CreateCaseAttachmentUploadSessionRequest,
    record: CreateCaseUploadRecord,
  ): Promise<CaseAttachmentResult<null>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await findCaseVersionAttachmentContext(
        transaction,
        organizationId,
        projectSlug,
        caseId,
        versionId,
      );
      if (!context) return { kind: 'not_found' };
      if (
        !(await hasPendingUploadCapacity(transaction, organizationId, userId, request.sizeBytes))
      ) {
        return { kind: 'upload_limit_reached' };
      }
      await transaction.uploadSession.create({
        data: {
          organizationId,
          id: record.id,
          projectId: context.projectId,
          caseVersionId: context.versionId,
          createdById: userId,
          storageKey: record.storageKey,
          fileName: request.fileName,
          contentType: request.contentType,
          sizeBytes: BigInt(request.sizeBytes),
          checksumSha256: request.checksumSha256,
          expiresAt: record.expiresAt,
        },
      });
      return { kind: 'found', value: null };
    });
  }

  async lookup(
    organizationId: string,
    userId: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    request: CompleteCaseAttachmentRequest,
  ): Promise<CaseAttachmentResult<CaseAttachmentUploadLookup>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await findCaseVersionAttachmentContext(
        transaction,
        organizationId,
        projectSlug,
        caseId,
        versionId,
      );
      if (!context) return { kind: 'not_found' };
      const upload = await transaction.uploadSession.findUnique({
        where: {
          organizationId_id: { organizationId, id: request.uploadId },
          projectId: context.projectId,
          caseVersionId: context.versionId,
          createdById: userId,
        },
        select: {
          id: true,
          storageKey: true,
          fileName: true,
          contentType: true,
          sizeBytes: true,
          checksumSha256: true,
          expiresAt: true,
          completedAt: true,
        },
      });
      if (!upload) return { kind: 'invalid_upload' };
      if (upload.completedAt) {
        const attachment = await this.findCompletedAttachment(
          transaction,
          organizationId,
          context.versionId,
          upload.id,
        );
        return attachment
          ? { kind: 'found', value: { state: 'completed', attachment } }
          : { kind: 'invalid_upload' };
      }
      if (upload.expiresAt <= new Date()) return { kind: 'invalid_upload' };
      return {
        kind: 'found',
        value: {
          state: 'pending',
          upload: { ...upload, sizeBytes: Number(upload.sizeBytes) },
        },
      };
    });
  }

  async complete(
    organizationId: string,
    userId: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    record: CompleteCaseUploadRecord,
  ): Promise<CaseAttachmentResult<CaseAttachment>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await findCaseVersionAttachmentContext(
        transaction,
        organizationId,
        projectSlug,
        caseId,
        versionId,
      );
      if (!context) return { kind: 'not_found' };
      await transaction.$queryRaw`
        SELECT id FROM upload_sessions
        WHERE organization_id = ${organizationId}::uuid
          AND id = ${record.upload.id}::uuid
        FOR UPDATE
      `;
      const upload = await transaction.uploadSession.findUnique({
        where: {
          organizationId_id: { organizationId, id: record.upload.id },
          projectId: context.projectId,
          caseVersionId: context.versionId,
          createdById: userId,
        },
        select: { id: true, completedAt: true, expiresAt: true },
      });
      if (!upload || upload.expiresAt <= new Date()) return { kind: 'invalid_upload' };
      if (upload.completedAt) {
        const attachment = await this.findCompletedAttachment(
          transaction,
          organizationId,
          context.versionId,
          upload.id,
        );
        return attachment ? { kind: 'found', value: attachment } : { kind: 'invalid_upload' };
      }
      const checkedAt = new Date();
      await transaction.attachmentBlob.upsert({
        where: {
          organizationId_checksumSha256: {
            organizationId,
            checksumSha256: record.upload.checksumSha256,
          },
        },
        create: {
          organizationId,
          checksumSha256: record.upload.checksumSha256,
          storageKey: record.storageKey,
          sizeBytes: BigInt(record.upload.sizeBytes),
          storageStatus: 'HEALTHY',
          storageCheckedAt: checkedAt,
          storageObservedSizeBytes: BigInt(record.upload.sizeBytes),
        },
        update: {
          storageKey: record.storageKey,
          sizeBytes: BigInt(record.upload.sizeBytes),
          storageStatus: 'HEALTHY',
          storageCheckedAt: checkedAt,
          storageObservedSizeBytes: BigInt(record.upload.sizeBytes),
        },
      });
      const attachment = await transaction.attachment.create({
        data: {
          organizationId,
          id: upload.id,
          targetType: AttachmentTargetType.CASE_VERSION,
          targetId: context.versionId,
          fileName: record.upload.fileName,
          contentType: record.upload.contentType,
          sizeBytes: BigInt(record.upload.sizeBytes),
          checksumSha256: record.upload.checksumSha256,
        },
        select: caseAttachmentSelect,
      });
      await transaction.uploadSession.update({
        where: { organizationId_id: { organizationId, id: upload.id } },
        data: { completedAt: new Date() },
      });
      return { kind: 'found', value: toCaseAttachment(attachment) };
    });
  }

  private async findCompletedAttachment(
    transaction: TenantTransaction,
    organizationId: string,
    versionId: string,
    attachmentId: string,
  ): Promise<CaseAttachment | null> {
    const attachment = await transaction.attachment.findFirst({
      where: {
        organizationId,
        id: attachmentId,
        targetType: AttachmentTargetType.CASE_VERSION,
        targetId: versionId,
        deletedAt: null,
      },
      select: caseAttachmentSelect,
    });
    return attachment ? toCaseAttachment(attachment) : null;
  }
}
