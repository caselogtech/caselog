import type {
  CandidateReport,
  CompleteCaseAttachmentRequest,
  CreateCandidateReportUploadRequest,
} from '@caselog/schemas';
import { Inject, Injectable } from '@nestjs/common';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../../core/database/application/services/tenant-database.service';
import { AttachmentTargetType } from '../../../generated/prisma/enums';
import type { CandidateReportContext } from '../../application/ports/candidate-report';
import {
  candidateReportSelect,
  toCandidateReport,
} from '../persistence/candidate-report.persistence';
import { hasPendingUploadCapacity } from '../persistence/upload-quota.persistence';
import type {
  CandidateReportResult,
  CandidateReportUploadLookup,
  PendingCandidateReportUpload,
} from './candidate-report.types';

export type CreateReportUploadRecord = {
  id: string;
  storageKey: string;
  expiresAt: Date;
};

export type CompleteReportUploadRecord = {
  storageKey: string;
  upload: PendingCandidateReportUpload;
};

@Injectable()
export class CandidateReportUploadRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async create(
    context: CandidateReportContext,
    userId: string,
    request: CreateCandidateReportUploadRequest,
    record: CreateReportUploadRecord,
  ): Promise<CandidateReportResult<null>> {
    const { organizationId } = context;
    return this.tenantDatabase.run(organizationId, async (transaction) => {
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
          candidateId: context.candidateId,
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
    context: CandidateReportContext,
    userId: string,
    request: CompleteCaseAttachmentRequest,
  ): Promise<CandidateReportResult<CandidateReportUploadLookup>> {
    const { organizationId } = context;
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const upload = await transaction.uploadSession.findUnique({
        where: {
          organizationId_id: { organizationId, id: request.uploadId },
          projectId: context.projectId,
          candidateId: context.candidateId,
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
          context.candidateId,
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
    context: CandidateReportContext,
    userId: string,
    record: CompleteReportUploadRecord,
  ): Promise<CandidateReportResult<CandidateReport>> {
    const { organizationId } = context;
    return this.tenantDatabase.run(organizationId, async (transaction) => {
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
          candidateId: context.candidateId,
          createdById: userId,
        },
        select: { id: true, completedAt: true, expiresAt: true },
      });
      if (!upload) return { kind: 'invalid_upload' };
      if (upload.completedAt) {
        const attachment = await this.findCompletedAttachment(
          transaction,
          organizationId,
          context.candidateId,
          upload.id,
        );
        return attachment ? { kind: 'found', value: attachment } : { kind: 'invalid_upload' };
      }
      if (upload.expiresAt <= new Date()) return { kind: 'invalid_upload' };
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
          targetType: AttachmentTargetType.CANDIDATE_REPORT,
          targetId: context.candidateId,
          fileName: record.upload.fileName,
          contentType: record.upload.contentType,
          sizeBytes: BigInt(record.upload.sizeBytes),
          checksumSha256: record.upload.checksumSha256,
        },
        select: candidateReportSelect,
      });
      await transaction.uploadSession.update({
        where: { organizationId_id: { organizationId, id: upload.id } },
        data: { completedAt: new Date() },
      });
      return { kind: 'found', value: toCandidateReport(attachment) };
    });
  }

  private async findCompletedAttachment(
    transaction: TenantTransaction,
    organizationId: string,
    candidateId: string,
    attachmentId: string,
  ): Promise<CandidateReport | null> {
    const attachment = await transaction.attachment.findFirst({
      where: {
        organizationId,
        id: attachmentId,
        targetType: AttachmentTargetType.CANDIDATE_REPORT,
        targetId: candidateId,
        deletedAt: null,
      },
      select: candidateReportSelect,
    });
    return attachment ? toCandidateReport(attachment) : null;
  }
}
