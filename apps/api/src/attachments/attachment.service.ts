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
