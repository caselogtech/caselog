import { Inject, Injectable } from '@nestjs/common';
import type { AuditLogListQuery, AuditLogListResponse } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';

@Injectable()
export class AuditLogRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  list(organizationId: string, query: AuditLogListQuery): Promise<AuditLogListResponse | null> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const cursor = query.cursor
        ? await transaction.auditLog.findUnique({
            where: { organizationId_id: { organizationId, id: query.cursor } },
            select: { id: true, createdAt: true },
          })
        : null;
      if (query.cursor && !cursor) return null;
      const records = await transaction.auditLog.findMany({
        where: {
          organizationId,
          ...(query.action ? { action: query.action } : {}),
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
        select: {
          id: true,
          actorId: true,
          actorType: true,
          action: true,
          targetType: true,
          targetId: true,
          metadata: true,
          createdAt: true,
        },
      });
      const hasMore = records.length > query.limit;
      const page = records.slice(0, query.limit);

      return {
        items: page.map((record) => ({
          id: record.id,
          actor: {
            id: record.actorId,
            type: record.actorType as 'user' | 'api_token' | 'system',
          },
          action: record.action,
          target: { type: record.targetType, id: record.targetId },
          metadata: record.metadata as Record<string, unknown>,
          createdAt: record.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }
}
