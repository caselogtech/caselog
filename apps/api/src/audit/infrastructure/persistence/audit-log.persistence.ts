import type { Prisma } from '../../../generated/prisma/client';
import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';

export type AuditActorType = 'user' | 'api_token' | 'system';

export type AppendAuditLogInput = {
  organizationId: string;
  actorId: string;
  actorType: AuditActorType;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonObject;
};

export async function appendAuditLog(
  transaction: TenantTransaction,
  input: AppendAuditLogInput,
): Promise<void> {
  await transaction.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorType: input.actorType,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
    },
  });
}
