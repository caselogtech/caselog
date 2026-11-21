import { randomUUID } from 'node:crypto';
import {
  attachmentDownloadResponseSchema,
  type CreateCandidateReportUploadRequest,
  candidateReportResponseSchema,
  createUploadSessionResponseSchema,
} from '@caselog/schemas';
import { Inject, Injectable } from '@nestjs/common';
import { ResourceConflictError, ResourceNotFoundError } from '../../../common/errors/domain.error';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/application/ports/storage.provider';
import type { CandidateReportResult } from '../../infrastructure/repositories/candidate-report.types';
import { CandidateReportQueryRepository } from '../../infrastructure/repositories/candidate-report-query.repository';
import { CandidateReportUploadRepository } from '../../infrastructure/repositories/candidate-report-upload.repository';
import type { CandidateReportContext } from '../ports/candidate-report';
import { AttachmentBlobService } from './attachment-blob.service';

@Injectable()
export class CandidateReportService {
  constructor(
    @Inject(CandidateReportUploadRepository)
    private readonly uploads: CandidateReportUploadRepository,
    @Inject(CandidateReportQueryRepository)
    private readonly reports: CandidateReportQueryRepository,
    @Inject(AttachmentBlobService) private readonly blobs: AttachmentBlobService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}
  async createUpload(
    context: CandidateReportContext,
    userId: string,
    request: CreateCandidateReportUploadRequest,
  ) {
    const id = randomUUID();
    const storageKey = `${context.organizationId}/candidates/${context.candidateId}/uploads/${id}`;
    const upload = await this.storage.createUploadUrl({ storageKey, ...request });
    this.unwrap(
      await this.uploads.create(context, userId, request, {
        id,
        storageKey,
        expiresAt: upload.expiresAt,
      }),
    );
    return createUploadSessionResponseSchema.parse({
      upload: {
        id,
        method: 'PUT',
        url: upload.url,
        headers: upload.headers,
        expiresAt: upload.expiresAt.toISOString(),
      },
    });
  }
  async complete(context: CandidateReportContext, userId: string, uploadId: string) {
    const lookup = this.unwrap(await this.uploads.lookup(context, userId, { uploadId }));
    if (lookup.state === 'completed')
      return candidateReportResponseSchema.parse({ attachment: lookup.attachment });
    try {
      const [blob] = await this.blobs.promoteMany(context.organizationId, [lookup.upload]);
      if (!blob) throw new Error('Promoted report blob disappeared');
      const attachment = this.unwrap(
        await this.uploads.complete(context, userId, {
          storageKey: blob.storageKey,
          upload: lookup.upload,
        }),
      );
      await this.storage.delete(lookup.upload.storageKey).catch(() => undefined);
      return candidateReportResponseSchema.parse({ attachment });
    } catch (error) {
      const replay = await this.uploads.lookup(context, userId, { uploadId });
      if (replay.kind === 'found' && replay.value.state === 'completed')
        return candidateReportResponseSchema.parse({ attachment: replay.value.attachment });
      throw error;
    }
  }
  async requireReports(context: CandidateReportContext, ids: string[]) {
    const reports = await this.reports.findMany(context, ids);
    if (reports.length !== ids.length) throw new ResourceNotFoundError('candidate_report');
    return reports;
  }
  async download(context: CandidateReportContext, id: string) {
    const report = await this.reports.download(context, id);
    if (!report) throw new ResourceNotFoundError('candidate_report');
    const download = await this.storage.createDownloadUrl(
      report.blob.storageKey,
      report.fileName,
      report.contentType,
    );
    return attachmentDownloadResponseSchema.parse({
      download: { url: download.url, expiresAt: download.expiresAt.toISOString() },
    });
  }
  private unwrap<T>(result: CandidateReportResult<T>): T {
    if (result.kind === 'found') return result.value;
    if (result.kind === 'not_found') throw new ResourceNotFoundError('candidate_report');
    throw new ResourceConflictError(
      result.kind,
      result.kind === 'upload_limit_reached'
        ? 'Too many pending uploads exist for this workspace'
        : 'The report upload is unavailable or expired',
    );
  }
}
