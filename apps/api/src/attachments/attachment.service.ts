import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  createUploadSessionResponseSchema,
  type CreateUploadSessionRequest,
  type CreateUploadSessionResponse,
  type OrganizationAccessPrincipal,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../common/errors/domain.error';
import { STORAGE_PROVIDER, type StorageProvider } from '../core/storage/storage.provider';
import { AttachmentRepository, type CreateUploadResult } from './attachment.repository';

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
    const prepared: PreparedResultAttachment[] = [];
    try {
      for (const upload of uploads) {
        const source = await this.storage.stat(upload.storageKey);
        if (!source || !this.matchesUpload(source, upload)) {
          throw new ResourceConflictError(
            'upload_incomplete',
            'An uploaded object is missing or does not match its declared metadata',
          );
        }
        const id = randomUUID();
        const storageKey = `${principal.organizationId}/runs/${runId}/attachments/${id}`;
        const attachment: PreparedResultAttachment = {
          id,
          uploadId: upload.id,
          sourceStorageKey: upload.storageKey,
          storageKey,
          fileName: upload.fileName,
          contentType: upload.contentType,
          sizeBytes: upload.sizeBytes,
          checksumSha256: upload.checksumSha256,
          stepPosition: upload.stepPosition,
        };
        prepared.push(attachment);
        await this.storage.copy(upload.storageKey, storageKey);
        const snapshot = await this.storage.stat(storageKey);
        if (!snapshot || !this.matchesUpload(snapshot, upload)) {
          throw new ResourceConflictError(
            'upload_incomplete',
            'The uploaded object could not be verified after promotion',
          );
        }
      }
      return prepared;
    } catch (error) {
      await this.deleteFinalObjects(prepared);
      throw error;
    }
  }

  async discardPreparedAttachments(attachments: PreparedResultAttachment[]): Promise<void> {
    await this.deleteFinalObjects(attachments);
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

  private matchesUpload(
    object: { contentType: string | null; sizeBytes: number; checksumSha256: string | null },
    upload: { contentType: string; sizeBytes: number; checksumSha256: string },
  ): boolean {
    return (
      object.contentType === upload.contentType &&
      object.sizeBytes === upload.sizeBytes &&
      object.checksumSha256 === upload.checksumSha256
    );
  }

  private async deleteFinalObjects(attachments: PreparedResultAttachment[]): Promise<void> {
    await Promise.allSettled(attachments.map(({ storageKey }) => this.storage.delete(storageKey)));
  }
}
