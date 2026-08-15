import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  attachmentDownloadResponseSchema,
  createUploadSessionResponseSchema,
  type AttachmentDownloadResponse,
  type CreateUploadSessionRequest,
  type CreateUploadSessionResponse,
  type OrganizationAccessPrincipal,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/application/ports/storage.provider';
import {
  AttachmentRepository,
  type CreateUploadResult,
} from '../../infrastructure/repositories/attachment.repository';
import { AttachmentBlobService } from './attachment-blob.service';

export type PreparedResultAttachment = {
  id: string;
  uploadId: string;
  sourceStorageKey: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  stepPosition: number | null;
};

@Injectable()
export class AttachmentService {
  constructor(
    @Inject(AttachmentRepository) private readonly attachments: AttachmentRepository,
    @Inject(AttachmentBlobService) private readonly blobs: AttachmentBlobService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async createUploadSession(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
    itemId: string,
    request: CreateUploadSessionRequest,
  ): Promise<CreateUploadSessionResponse> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    const uploadId = randomUUID();
    const storageKey = `${principal.organizationId}/runs/${runId}/uploads/${uploadId}`;
    const upload = await this.storage.createUploadUrl({
      storageKey,
      contentType: request.contentType,
      checksumSha256: request.checksumSha256,
      sizeBytes: request.sizeBytes,
    });
    const result = await this.attachments.createUploadSession(
      principal.organizationId,
      principal.sub,
      projectSlug,
      runId,
      itemId,
      request,
      { id: uploadId, storageKey, expiresAt: upload.expiresAt },
    );
    this.assertCreated(result);
    return createUploadSessionResponseSchema.parse({
      upload: {
        id: uploadId,
        method: 'PUT',
        url: upload.url,
        headers: upload.headers,
        expiresAt: upload.expiresAt.toISOString(),
      },
    });
  }

  async createResultAttachmentDownload(
    organizationId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    resultId: string,
    attachmentId: string,
  ): Promise<AttachmentDownloadResponse> {
    const attachment = await this.attachments.findResultAttachment(
      organizationId,
      projectSlug,
      runId,
      itemId,
      resultId,
      attachmentId,
    );
    if (!attachment) throw new ResourceNotFoundError('attachment');
    const download = await this.storage.createDownloadUrl(
      attachment.storageKey,
      attachment.fileName,
      attachment.contentType,
    );
    return attachmentDownloadResponseSchema.parse({
      download: { url: download.url, expiresAt: download.expiresAt.toISOString() },
    });
  }

  async prepareResultAttachments(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
    itemId: string,
    uploadIds: string[],
  ): Promise<PreparedResultAttachment[]> {
    if (uploadIds.length === 0) return [];
    const uploads = await this.attachments.findPendingUploadSessions(
      principal.organizationId,
      principal.sub,
      projectSlug,
      runId,
      itemId,
      uploadIds,
    );
    if (!uploads) {
      throw new ResourceConflictError(
        'invalid_upload',
        'One or more uploads are expired, completed, or unavailable for this result',
      );
    }
    const promoted = await this.blobs.promoteMany(principal.organizationId, uploads);
    return uploads.map((upload, index) => {
      const blob = promoted[index];
      if (!blob) throw new Error('Promoted attachment blob disappeared');
      return {
        id: randomUUID(),
        uploadId: upload.id,
        sourceStorageKey: upload.storageKey,
        storageKey: blob.storageKey,
        fileName: upload.fileName,
        contentType: upload.contentType,
        sizeBytes: upload.sizeBytes,
        checksumSha256: upload.checksumSha256,
        stepPosition: upload.stepPosition,
      };
    });
  }

  async discardPreparedAttachments(_attachments: PreparedResultAttachment[]): Promise<void> {
    // A content-addressed object may already be referenced by another request.
    // Unreferenced promotions are reclaimed by the bounded orphan scan.
  }

  async discardCompletedUploadObjects(attachments: PreparedResultAttachment[]): Promise<void> {
    await Promise.allSettled(
      attachments.map(({ sourceStorageKey }) => this.storage.delete(sourceStorageKey)),
    );
  }

  private assertCreated(result: CreateUploadResult): asserts result is { kind: 'created' } {
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'run_not_found') throw new ResourceNotFoundError('test_run');
    if (result.kind === 'item_not_found') throw new ResourceNotFoundError('test_run_item');
    if (result.kind === 'run_closed') {
      throw new ResourceConflictError('run_closed', 'The test run is closed for changes');
    }
    if (result.kind === 'invalid_step_position') {
      throw new ResourceConflictError(
        'invalid_upload_target',
        'The upload step does not exist in the immutable test case snapshot',
      );
    }
    if (result.kind === 'upload_limit_reached') {
      throw new ResourceConflictError(
        'upload_limit_reached',
        'Too many pending uploads exist for this workspace',
      );
    }
  }
}
