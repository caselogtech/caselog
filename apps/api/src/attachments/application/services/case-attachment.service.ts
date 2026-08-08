import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  attachmentDownloadResponseSchema,
  caseAttachmentListResponseSchema,
  caseAttachmentResponseSchema,
  createUploadSessionResponseSchema,
  type AttachmentDownloadResponse,
  type CaseAttachmentListQuery,
  type CaseAttachmentListResponse,
  type CaseAttachmentResponse,
  type CompleteCaseAttachmentRequest,
  type CreateCaseAttachmentUploadSessionRequest,
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
import { uploadMetadataMatches } from '../../domain/policies/upload-metadata';
import { CaseAttachmentQueryRepository } from '../../infrastructure/repositories/case-attachment-query.repository';
import type { CaseAttachmentResult } from '../../infrastructure/repositories/case-attachment.types';
import { CaseAttachmentUploadRepository } from '../../infrastructure/repositories/case-attachment-upload.repository';

@Injectable()
export class CaseAttachmentService {
  constructor(
    @Inject(CaseAttachmentUploadRepository)
    private readonly uploads: CaseAttachmentUploadRepository,
    @Inject(CaseAttachmentQueryRepository)
    private readonly attachments: CaseAttachmentQueryRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async createUploadSession(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    caseId: string,
    versionId: string,
    request: CreateCaseAttachmentUploadSessionRequest,
  ): Promise<CreateUploadSessionResponse> {
    this.assertCanEdit(principal);
    const uploadId = randomUUID();
    const storageKey = this.storagePath(
      principal.organizationId,
      caseId,
      versionId,
      'uploads',
      uploadId,
    );
    const upload = await this.storage.createUploadUrl({ storageKey, ...request });
    const result = await this.uploads.create(
      principal.organizationId,
      principal.sub,
      projectSlug,
      caseId,
      versionId,
      request,
      { id: uploadId, storageKey, expiresAt: upload.expiresAt },
    );
    this.assertFound(result);
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

  async complete(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    caseId: string,
    versionId: string,
    request: CompleteCaseAttachmentRequest,
  ): Promise<CaseAttachmentResponse> {
    this.assertCanEdit(principal);
    const lookup = await this.uploads.lookup(
      principal.organizationId,
      principal.sub,
      projectSlug,
      caseId,
      versionId,
      request,
    );
    this.assertFound(lookup);
    if (lookup.value.state === 'completed') {
      return caseAttachmentResponseSchema.parse({ attachment: lookup.value.attachment });
    }

    const upload = lookup.value.upload;
    const storageKey = this.storagePath(
      principal.organizationId,
      caseId,
      versionId,
      'attachments',
      upload.id,
    );

    let response: CaseAttachmentResponse;
    try {
      const source = await this.storage.stat(upload.storageKey);
      if (!source || !uploadMetadataMatches(source, upload)) this.incompleteUpload();
      await this.storage.copy(upload.storageKey, storageKey);
      const snapshot = await this.storage.stat(storageKey);
      if (!snapshot || !uploadMetadataMatches(snapshot, upload)) this.incompleteUpload();
      const result = await this.uploads.complete(
        principal.organizationId,
        principal.sub,
        projectSlug,
        caseId,
        versionId,
        { storageKey, upload },
      );
      this.assertFound(result);
      response = caseAttachmentResponseSchema.parse({ attachment: result.value });
    } catch (error) {
      const replay = await this.uploads.lookup(
        principal.organizationId,
        principal.sub,
        projectSlug,
        caseId,
        versionId,
        request,
      );
      if (replay.kind === 'found' && replay.value.state === 'completed') {
        return caseAttachmentResponseSchema.parse({ attachment: replay.value.attachment });
      }
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
    await this.storage.delete(upload.storageKey).catch(() => undefined);
    return response;
  }

  async list(
    organizationId: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    query: CaseAttachmentListQuery,
  ): Promise<CaseAttachmentListResponse> {
    const result = await this.attachments.list(
      organizationId,
      projectSlug,
      caseId,
      versionId,
      query,
    );
    this.assertFound(result);
    return caseAttachmentListResponseSchema.parse(result.value);
  }

  async createDownload(
    organizationId: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    attachmentId: string,
  ): Promise<AttachmentDownloadResponse> {
    const result = await this.attachments.findDownload(
      organizationId,
      projectSlug,
      caseId,
      versionId,
      attachmentId,
    );
    this.assertFound(result);
    const download = await this.storage.createDownloadUrl(
      result.value.storageKey,
      result.value.fileName,
    );
    return attachmentDownloadResponseSchema.parse({
      download: { url: download.url, expiresAt: download.expiresAt.toISOString() },
    });
  }

  private assertCanEdit(principal: OrganizationAccessPrincipal): void {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
  }

  private assertFound<T>(result: CaseAttachmentResult<T>): asserts result is {
    kind: 'found';
    value: T;
  } {
    if (result.kind === 'not_found') throw new ResourceNotFoundError('test_case_version');
    if (result.kind === 'invalid_upload') {
      throw new ResourceConflictError(
        'invalid_upload',
        'The upload is expired, completed without an attachment, or unavailable',
      );
    }
    if (result.kind === 'upload_limit_reached') {
      throw new ResourceConflictError(
        'upload_limit_reached',
        'Too many pending uploads exist for this workspace',
      );
    }
  }

  private incompleteUpload(): never {
    throw new ResourceConflictError(
      'upload_incomplete',
      'The uploaded object is missing or does not match its declared metadata',
    );
  }

  private storagePath(
    organizationId: string,
    caseId: string,
    versionId: string,
    collection: 'uploads' | 'attachments',
    objectId: string,
  ): string {
    return `${organizationId}/cases/${caseId}/versions/${versionId}/${collection}/${objectId}`;
  }
}
