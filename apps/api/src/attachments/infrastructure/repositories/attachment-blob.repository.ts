import { Inject, Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';

export type ExistingAttachmentBlob = {
  checksumSha256: string;
  storageKey: string;
  sizeBytes: number;
};

@Injectable()
export class AttachmentBlobRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async findByChecksums(
    organizationId: string,
    checksums: string[],
  ): Promise<ExistingAttachmentBlob[]> {
    if (checksums.length === 0) return [];
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const blobs = await transaction.attachmentBlob.findMany({
        where: { organizationId, checksumSha256: { in: [...new Set(checksums)] } },
        select: { checksumSha256: true, storageKey: true, sizeBytes: true },
      });
      return blobs.map((blob) => ({ ...blob, sizeBytes: Number(blob.sizeBytes) }));
    });
  }
}
