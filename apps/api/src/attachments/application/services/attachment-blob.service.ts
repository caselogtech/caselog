import { Inject, Injectable } from '@nestjs/common';
import { ResourceConflictError } from '../../../common/errors/domain.error';
import { MetricsService } from '../../../core/observability/application/services/metrics.service';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/application/ports/storage.provider';
import {
  attachmentBlobMatches,
  attachmentBlobStorageKey,
} from '../../domain/policies/attachment-blob';
import { uploadMetadataMatches } from '../../domain/policies/upload-metadata';
import {
  AttachmentBlobRepository,
  type ExistingAttachmentBlob,
} from '../../infrastructure/repositories/attachment-blob.repository';

export type PromotableAttachment = {
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
};

export type PromotedAttachmentBlob = {
  storageKey: string;
  sizeBytes: number;
  checksumSha256: string;
};

@Injectable()
export class AttachmentBlobService {
  constructor(
    @Inject(AttachmentBlobRepository) private readonly blobs: AttachmentBlobRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  async promoteMany(
    organizationId: string,
    uploads: PromotableAttachment[],
  ): Promise<PromotedAttachmentBlob[]> {
    const existing = await this.blobs.findByChecksums(
      organizationId,
      uploads.map(({ checksumSha256 }) => checksumSha256),
    );
    const existingByChecksum = new Map(existing.map((blob) => [blob.checksumSha256, blob]));
    const promoted: PromotedAttachmentBlob[] = [];
    for (const upload of uploads) {
      promoted.push(
        await this.promote(organizationId, upload, existingByChecksum.get(upload.checksumSha256)),
      );
    }
    return promoted;
  }

  private async promote(
    organizationId: string,
    upload: PromotableAttachment,
    existing: ExistingAttachmentBlob | undefined,
  ): Promise<PromotedAttachmentBlob> {
    if (existing && existing.sizeBytes !== upload.sizeBytes) {
      throw new ResourceConflictError(
        'attachment_checksum_conflict',
        'An existing attachment with this checksum has different metadata',
      );
    }

    const source = await this.storage.stat(upload.storageKey);
    if (!source || !uploadMetadataMatches(source, upload)) this.incompleteUpload();

    const storageKey =
      existing?.storageKey ?? attachmentBlobStorageKey(organizationId, upload.checksumSha256);
    const destination = await this.storage.stat(storageKey);
    if (destination && attachmentBlobMatches(destination, upload)) {
      this.metrics.observeAttachmentBlobPromotion('reused');
      return { storageKey, sizeBytes: upload.sizeBytes, checksumSha256: upload.checksumSha256 };
    }

    await this.storage.copy(upload.storageKey, storageKey);
    const promoted = await this.storage.stat(storageKey);
    if (!promoted || !attachmentBlobMatches(promoted, upload)) this.incompleteUpload();
    this.metrics.observeAttachmentBlobPromotion(destination ? 'repaired' : 'created');
    return { storageKey, sizeBytes: upload.sizeBytes, checksumSha256: upload.checksumSha256 };
  }

  private incompleteUpload(): never {
    throw new ResourceConflictError(
      'upload_incomplete',
      'The uploaded object is missing or does not match its declared metadata',
    );
  }
}
