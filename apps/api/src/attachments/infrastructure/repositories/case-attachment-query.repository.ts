import { Inject, Injectable } from '@nestjs/common';
import type { CaseAttachmentListQuery, CaseAttachmentListResponse } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { AttachmentTargetType } from '../../../generated/prisma/enums';
import {
  caseAttachmentSelect,
  findCaseVersionAttachmentContext,
  toCaseAttachment,
} from '../persistence/case-attachment.persistence';
import type { CaseAttachmentDownload, CaseAttachmentResult } from './case-attachment.types';

@Injectable()
export class CaseAttachmentQueryRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async list(
    organizationId: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    query: CaseAttachmentListQuery,
  ): Promise<CaseAttachmentResult<CaseAttachmentListResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await findCaseVersionAttachmentContext(
        transaction,
        organizationId,
        projectSlug,
        caseId,
        versionId,
      );
      if (!context) return { kind: 'not_found' };
      const cursor = query.cursor
        ? await transaction.attachment.findFirst({
            where: {
              organizationId,
              id: query.cursor,
              targetType: AttachmentTargetType.CASE_VERSION,
              targetId: context.versionId,
              deletedAt: null,
            },
            select: { id: true, createdAt: true },
          })
        : null;
      if (query.cursor && !cursor) return { kind: 'not_found' };
      const attachments = await transaction.attachment.findMany({
        where: {
          organizationId,
          targetType: AttachmentTargetType.CASE_VERSION,
          targetId: context.versionId,
          deletedAt: null,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: caseAttachmentSelect,
      });
      const hasMore = attachments.length > query.limit;
      const items = attachments.slice(0, query.limit).map(toCaseAttachment);
      return {
        kind: 'found',
        value: { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
      };
    });
  }

  async findDownload(
    organizationId: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    attachmentId: string,
  ): Promise<CaseAttachmentResult<CaseAttachmentDownload>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await findCaseVersionAttachmentContext(
        transaction,
        organizationId,
        projectSlug,
        caseId,
        versionId,
      );
      if (!context) return { kind: 'not_found' };
      const attachment = await transaction.attachment.findFirst({
        where: {
          organizationId,
          id: attachmentId,
          targetType: AttachmentTargetType.CASE_VERSION,
          targetId: context.versionId,
          deletedAt: null,
        },
        select: {
          fileName: true,
          contentType: true,
          blob: { select: { storageKey: true } },
        },
      });
      return attachment
        ? {
            kind: 'found',
            value: {
              storageKey: attachment.blob.storageKey,
              fileName: attachment.fileName,
              contentType: attachment.contentType,
            },
          }
        : { kind: 'not_found' };
    });
  }
}
