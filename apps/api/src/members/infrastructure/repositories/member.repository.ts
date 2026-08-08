import { Inject, Injectable } from '@nestjs/common';
import type {
  ManageableWorkspaceRole,
  WorkspaceMember,
  WorkspaceMemberListQuery,
  WorkspaceMemberListResponse,
} from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';
import type { MembershipRole } from '../../../generated/prisma/enums';
import {
  canManageMember,
  canTransferOwnership,
} from '../../domain/policies/member-management.policy';

const ROLE_TO_DATABASE: Record<ManageableWorkspaceRole, MembershipRole> = {
  admin: 'ADMIN',
  lead: 'LEAD',
  tester: 'TESTER',
  contributor: 'CONTRIBUTOR',
  read_only: 'READ_ONLY',
};

const ROLE_FROM_DATABASE: Record<MembershipRole, WorkspaceMember['role']> = {
  OWNER: 'owner',
  ADMIN: 'admin',
  LEAD: 'lead',
  TESTER: 'tester',
  CONTRIBUTOR: 'contributor',
  READ_ONLY: 'read_only',
};

type LockedMembership = {
  id: string;
  userId: string;
  role: MembershipRole;
  deletedAt: Date | null;
};

type MemberMutationResult =
  | { kind: 'found'; value: WorkspaceMember }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

@Injectable()
export class MemberRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  list(
    organizationId: string,
    query: WorkspaceMemberListQuery,
  ): Promise<WorkspaceMemberListResponse | null> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const cursor = query.cursor
        ? await transaction.membership.findUnique({
            where: { organizationId_id: { organizationId, id: query.cursor } },
            select: { id: true, createdAt: true },
          })
        : null;
      if (query.cursor && !cursor) return null;
      const records = await transaction.membership.findMany({
        where: {
          organizationId,
          ...(query.state === 'active'
            ? { deletedAt: null }
            : query.state === 'inactive'
              ? { deletedAt: { not: null } }
              : {}),
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
        select: this.memberSelection,
      });
      const hasMore = records.length > query.limit;
      const page = records.slice(0, query.limit);
      return {
        items: page.map((record) => this.toMember(record)),
        nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  updateRole(
    organizationId: string,
    actorMembershipId: string,
    actorUserId: string,
    targetMembershipId: string,
    role: ManageableWorkspaceRole,
  ): Promise<MemberMutationResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await this.lockContext(
        transaction,
        organizationId,
        actorMembershipId,
        actorUserId,
        targetMembershipId,
      );
      if (!context) return { kind: 'not_found' };
      const { actor, target } = context;
      if (!target.active) return { kind: 'not_found' };
      if (!canManageMember(this.toPolicyMember(actor), this.toPolicyMember(target), role)) {
        return { kind: 'forbidden' };
      }
      const nextRole = ROLE_TO_DATABASE[role];
      if (target.role !== nextRole) {
        await transaction.membership.update({
          where: { organizationId_id: { organizationId, id: target.id } },
          data: { role: nextRole },
        });
        await appendAuditLog(transaction, {
          organizationId,
          actorId: actor.userId,
          actorType: 'user',
          action: 'membership.role_changed',
          targetType: 'membership',
          targetId: target.id,
          metadata: {
            targetUserId: target.userId,
            previousRole: ROLE_FROM_DATABASE[target.role],
            nextRole: role,
          },
        });
      }
      return {
        kind: 'found',
        value: await this.findRequired(transaction, organizationId, target.id),
      };
    });
  }

  setActive(
    organizationId: string,
    actorMembershipId: string,
    actorUserId: string,
    targetMembershipId: string,
    active: boolean,
  ): Promise<MemberMutationResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await this.lockContext(
        transaction,
        organizationId,
        actorMembershipId,
        actorUserId,
        targetMembershipId,
      );
      if (!context) return { kind: 'not_found' };
      const { actor, target } = context;
      if (!canManageMember(this.toPolicyMember(actor), this.toPolicyMember(target))) {
        return { kind: 'forbidden' };
      }
      if (target.active !== active) {
        const changedAt = new Date();
        await transaction.membership.update({
          where: { organizationId_id: { organizationId, id: target.id } },
          data: { deletedAt: active ? null : changedAt },
        });
        const revokedTokens = active
          ? { count: 0 }
          : await transaction.apiToken.updateMany({
              where: {
                organizationId,
                createdById: target.userId,
                revokedAt: null,
              },
              data: { revokedAt: changedAt },
            });
        await appendAuditLog(transaction, {
          organizationId,
          actorId: actor.userId,
          actorType: 'user',
          action: active ? 'membership.activated' : 'membership.deactivated',
          targetType: 'membership',
          targetId: target.id,
          metadata: {
            targetUserId: target.userId,
            role: ROLE_FROM_DATABASE[target.role],
            ...(active ? {} : { revokedApiTokenCount: revokedTokens.count }),
          },
        });
      }
      return {
        kind: 'found',
        value: await this.findRequired(transaction, organizationId, target.id),
      };
    });
  }

  transferOwnership(
    organizationId: string,
    actorMembershipId: string,
    actorUserId: string,
    targetMembershipId: string,
  ): Promise<MemberMutationResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await this.lockContext(
        transaction,
        organizationId,
        actorMembershipId,
        actorUserId,
        targetMembershipId,
      );
      if (!context) return { kind: 'not_found' };
      const { actor, target } = context;
      if (!canTransferOwnership(this.toPolicyMember(actor), this.toPolicyMember(target))) {
        return { kind: 'forbidden' };
      }
      await transaction.membership.update({
        where: { organizationId_id: { organizationId, id: actor.id } },
        data: { role: 'ADMIN' },
      });
      await transaction.membership.update({
        where: { organizationId_id: { organizationId, id: target.id } },
        data: { role: 'OWNER' },
      });
      await appendAuditLog(transaction, {
        organizationId,
        actorId: actor.userId,
        actorType: 'user',
        action: 'membership.ownership_transferred',
        targetType: 'membership',
        targetId: target.id,
        metadata: {
          previousOwnerMembershipId: actor.id,
          previousOwnerUserId: actor.userId,
          nextOwnerUserId: target.userId,
        },
      });
      return {
        kind: 'found',
        value: await this.findRequired(transaction, organizationId, target.id),
      };
    });
  }

  private async lockContext(
    transaction: TenantTransaction,
    organizationId: string,
    actorMembershipId: string,
    actorUserId: string,
    targetMembershipId: string,
  ): Promise<
    | {
        actor: LockedMembership & { active: boolean };
        target: LockedMembership & { active: boolean };
      }
    | undefined
  > {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM memberships
      WHERE organization_id = ${organizationId}::uuid
        AND id IN (${actorMembershipId}::uuid, ${targetMembershipId}::uuid)
      ORDER BY id
      FOR UPDATE
    `;
    const rows = await transaction.membership.findMany({
      where: { id: { in: locked.map(({ id }) => id) } },
      select: { id: true, userId: true, role: true, deletedAt: true },
    });
    const actor = rows.find((row) => row.id === actorMembershipId && row.userId === actorUserId);
    const target = rows.find((row) => row.id === targetMembershipId);
    if (!actor || !target) return undefined;
    return {
      actor: { ...actor, active: actor.deletedAt === null },
      target: { ...target, active: target.deletedAt === null },
    };
  }

  private async findRequired(
    transaction: TenantTransaction,
    organizationId: string,
    membershipId: string,
  ): Promise<WorkspaceMember> {
    const record = await transaction.membership.findUniqueOrThrow({
      where: { organizationId_id: { organizationId, id: membershipId } },
      select: this.memberSelection,
    });
    return this.toMember(record);
  }

  private readonly memberSelection = {
    id: true,
    role: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    user: { select: { id: true, email: true, displayName: true } },
  } as const;

  private toPolicyMember(member: LockedMembership & { active: boolean }) {
    return { ...member, role: ROLE_FROM_DATABASE[member.role] };
  }

  private toMember(record: {
    id: string;
    role: MembershipRole;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    user: { id: string; email: string; displayName: string };
  }): WorkspaceMember {
    return {
      membershipId: record.id,
      user: record.user,
      role: ROLE_FROM_DATABASE[record.role],
      state: record.deletedAt ? 'inactive' : 'active',
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
