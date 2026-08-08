import { Inject, Injectable } from '@nestjs/common';
import type { UpdateWorkspaceRequest, WorkspaceSettings } from '@caselog/schemas';
import { Prisma } from '../../../generated/prisma/client';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';

const RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

type WorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  deletedAt: Date | null;
};

export type UpdateWorkspaceResult =
  | { kind: 'updated'; value: WorkspaceSettings }
  | { kind: 'not_found' }
  | { kind: 'slug_conflict' };

export type DeleteWorkspaceResult =
  | { kind: 'deleted'; value: WorkspaceSettings }
  | { kind: 'not_found' }
  | { kind: 'confirmation_mismatch' };

export type RestoreWorkspaceResult =
  | { kind: 'restored'; value: WorkspaceSettings }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'recovery_window_expired' };

@Injectable()
export class WorkspaceSettingsRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async findActive(organizationId: string): Promise<WorkspaceSettings | null> {
    const record = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
        select: { id: true, name: true, slug: true, deletedAt: true },
      }),
    );
    return record ? this.toSettings(record) : null;
  }

  async update(
    organizationId: string,
    actorId: string,
    input: UpdateWorkspaceRequest,
  ): Promise<UpdateWorkspaceResult> {
    try {
      return await this.tenantDatabase.run(organizationId, async (transaction) => {
        const [current] = await transaction.$queryRaw<WorkspaceRecord[]>`
          SELECT id, name, slug, deleted_at AS "deletedAt"
          FROM organizations
          WHERE id = ${organizationId}::UUID AND deleted_at IS NULL
          FOR UPDATE
        `;
        if (!current) return { kind: 'not_found' };

        if (input.slug && input.slug !== current.slug) {
          await transaction.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`workspace-slug:${input.slug}`}, 0)
            )
          `;
          const [availability] = await transaction.$queryRaw<Array<{ available: boolean }>>`
            SELECT public.workspace_slug_is_available_for(
              ${input.slug}::VARCHAR(30),
              ${organizationId}::UUID
            ) AS available
          `;
          if (!availability?.available) return { kind: 'slug_conflict' };
          const redirect = await transaction.organizationSlugRedirect.findUnique({
            where: { slug: input.slug },
            select: { organizationId: true },
          });
          if (redirect) {
            await transaction.organizationSlugRedirect.delete({ where: { slug: input.slug } });
          }
        }

        const updated = await transaction.organization.update({
          where: { id: organizationId },
          data: { name: input.name, slug: input.slug },
          select: { id: true, name: true, slug: true, deletedAt: true },
        });
        if (updated.slug !== current.slug) {
          await transaction.organizationSlugRedirect.create({
            data: { organizationId, slug: current.slug },
          });
        }

        const changedFields = [
          ...(updated.name !== current.name ? ['name'] : []),
          ...(updated.slug !== current.slug ? ['slug'] : []),
        ];
        if (changedFields.length > 0) {
          await appendAuditLog(transaction, {
            organizationId,
            actorId,
            actorType: 'user',
            action: 'workspace.updated',
            targetType: 'workspace',
            targetId: organizationId,
            metadata: { changedFields },
          });
        }
        return { kind: 'updated', value: this.toSettings(updated) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { kind: 'slug_conflict' };
      }
      throw error;
    }
  }

  delete(
    organizationId: string,
    actorId: string,
    confirmation: string,
  ): Promise<DeleteWorkspaceResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const [current] = await transaction.$queryRaw<WorkspaceRecord[]>`
        SELECT id, name, slug, deleted_at AS "deletedAt"
        FROM organizations
        WHERE id = ${organizationId}::UUID AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (!current) return { kind: 'not_found' };
      if (confirmation !== current.name) return { kind: 'confirmation_mismatch' };

      const deletedAt = new Date();
      await transaction.apiToken.updateMany({
        where: { organizationId, revokedAt: null },
        data: { revokedAt: deletedAt },
      });
      await transaction.workspaceInvitation.updateMany({
        where: { organizationId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: deletedAt },
      });
      await appendAuditLog(transaction, {
        organizationId,
        actorId,
        actorType: 'user',
        action: 'workspace.deletion_requested',
        targetType: 'workspace',
        targetId: organizationId,
        metadata: { recoverableUntil: this.recoverableUntil(deletedAt).toISOString() },
      });
      const deleted = await transaction.organization.update({
        where: { id: organizationId },
        data: { deletedAt },
        select: { id: true, name: true, slug: true, deletedAt: true },
      });
      return { kind: 'deleted', value: this.toSettings(deleted) };
    });
  }

  async restore(userId: string, organizationId: string): Promise<RestoreWorkspaceResult> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT set_config('caselog.organization_id', ${organizationId}, true)
      `;
      const [current] = await transaction.$queryRaw<WorkspaceRecord[]>`
        SELECT id, name, slug, deleted_at AS "deletedAt"
        FROM organizations
        WHERE id = ${organizationId}::UUID
        FOR UPDATE
      `;
      if (!current) return { kind: 'not_found' };

      const membership = await transaction.membership.findFirst({
        where: { organizationId, userId, deletedAt: null },
        select: { role: true },
      });
      if (!membership) return { kind: 'not_found' };
      if (membership.role !== 'OWNER') return { kind: 'forbidden' };
      if (!current.deletedAt) {
        return { kind: 'restored', value: this.toSettings(current) };
      }
      if (this.recoverableUntil(current.deletedAt).getTime() <= Date.now()) {
        return { kind: 'recovery_window_expired' };
      }

      const restored = await transaction.organization.update({
        where: { id: organizationId },
        data: { deletedAt: null },
        select: { id: true, name: true, slug: true, deletedAt: true },
      });
      await appendAuditLog(transaction, {
        organizationId,
        actorId: userId,
        actorType: 'user',
        action: 'workspace.restored',
        targetType: 'workspace',
        targetId: organizationId,
      });
      return { kind: 'restored', value: this.toSettings(restored) };
    });
  }

  private toSettings(record: WorkspaceRecord): WorkspaceSettings {
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      deletedAt: record.deletedAt?.toISOString() ?? null,
      recoverableUntil: record.deletedAt
        ? this.recoverableUntil(record.deletedAt).toISOString()
        : null,
    };
  }

  private recoverableUntil(deletedAt: Date): Date {
    return new Date(deletedAt.getTime() + RECOVERY_WINDOW_MS);
  }
}
