import { Inject, Injectable } from '@nestjs/common';
import type {
  AcceptWorkspaceInvitationResponse,
  ManageableWorkspaceRole,
  WorkspaceInvitation,
  WorkspaceInvitationListQuery,
  WorkspaceInvitationListResponse,
  WorkspaceInvitationPreview,
  WorkspaceMember,
} from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../../core/database/application/services/tenant-database.service';
import type { MembershipRole } from '../../../generated/prisma/enums';
import { canInviteRole } from '../../domain/policies/member-management.policy';

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

type PreparedInvitation = {
  email: string;
  role: ManageableWorkspaceRole;
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

type DeliveryContext = {
  invitation: WorkspaceInvitation;
  token: string;
  workspaceName: string;
  inviterName: string;
};

export type CreateInvitationsResult =
  | { kind: 'created'; value: DeliveryContext[] }
  | { kind: 'member_exists'; email: string }
  | { kind: 'forbidden' };

export type InvitationMutationResult =
  | { kind: 'found'; value: DeliveryContext }
  | { kind: 'not_found' | 'invalid' | 'forbidden' | 'member_exists' };

export type AcceptInvitationResult =
  | { kind: 'accepted'; value: AcceptWorkspaceInvitationResponse }
  | { kind: 'invalid' | 'email_mismatch' | 'member_exists' };

@Injectable()
export class InvitationRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  createMany(
    organizationId: string,
    actorMembershipId: string,
    actorUserId: string,
    invitations: PreparedInvitation[],
  ): Promise<CreateInvitationsResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const manager = await this.lockManager(
        transaction,
        organizationId,
        actorMembershipId,
        actorUserId,
      );
      if (!manager) return { kind: 'forbidden' };
      if (invitations.some(({ role }) => !canInviteRole(manager.role, role))) {
        return { kind: 'forbidden' };
      }
      const existingMember = await transaction.membership.findFirst({
        where: {
          deletedAt: null,
          user: { email: { in: invitations.map(({ email }) => email) }, deletedAt: null },
        },
        select: { user: { select: { email: true } } },
      });
      if (existingMember) return { kind: 'member_exists', email: existingMember.user.email };

      const context = await transaction.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true },
      });
      const inviter = await transaction.user.findUniqueOrThrow({
        where: { id: actorUserId },
        select: { displayName: true },
      });
      const deliveries: DeliveryContext[] = [];
      for (const input of invitations) {
        const existing = await transaction.workspaceInvitation.findUnique({
          where: { organizationId_email: { organizationId, email: input.email } },
          select: { id: true },
        });
        const record = await transaction.workspaceInvitation.upsert({
          where: { organizationId_email: { organizationId, email: input.email } },
          create: {
            organizationId,
            email: input.email,
            role: ROLE_TO_DATABASE[input.role],
            tokenHash: input.tokenHash,
            invitedById: actorUserId,
            expiresAt: input.expiresAt,
          },
          update: {
            role: ROLE_TO_DATABASE[input.role],
            tokenHash: input.tokenHash,
            invitedById: actorUserId,
            expiresAt: input.expiresAt,
            acceptedAt: null,
            revokedAt: null,
          },
          select: this.invitationSelection,
        });
        await appendAuditLog(transaction, {
          organizationId,
          actorId: actorUserId,
          actorType: 'user',
          action: existing ? 'membership.invitation_resent' : 'membership.invitation_sent',
          targetType: 'workspace_invitation',
          targetId: record.id,
          metadata: { role: input.role },
        });
        deliveries.push({
          invitation: this.toInvitation(record),
          token: input.token,
          workspaceName: context.name,
          inviterName: inviter.displayName,
        });
      }
      return { kind: 'created', value: deliveries };
    });
  }

  list(
    organizationId: string,
    query: WorkspaceInvitationListQuery,
  ): Promise<WorkspaceInvitationListResponse | null> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const cursor = query.cursor
        ? await transaction.workspaceInvitation.findUnique({
            where: { organizationId_id: { organizationId, id: query.cursor } },
            select: { id: true, createdAt: true },
          })
        : null;
      if (query.cursor && !cursor) return null;
      const now = new Date();
      const records = await transaction.workspaceInvitation.findMany({
        where: {
          organizationId,
          ...this.statusWhere(query.status, now),
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
        select: this.invitationSelection,
      });
      const hasMore = records.length > query.limit;
      const page = records.slice(0, query.limit);
      return {
        items: page.map((record) => this.toInvitation(record, now)),
        nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  resend(
    organizationId: string,
    actorMembershipId: string,
    actorUserId: string,
    invitationId: string,
    token: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<InvitationMutationResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const manager = await this.lockManager(
        transaction,
        organizationId,
        actorMembershipId,
        actorUserId,
      );
      if (!manager) return { kind: 'forbidden' };
      const invitation = await this.lockInvitation(transaction, organizationId, invitationId);
      if (!invitation) return { kind: 'not_found' };
      const role = ROLE_FROM_DATABASE[invitation.role];
      if (role === 'owner' || !canInviteRole(manager.role, role)) return { kind: 'forbidden' };
      const activeMember = await transaction.membership.findFirst({
        where: { deletedAt: null, user: { email: invitation.email, deletedAt: null } },
        select: { id: true },
      });
      if (activeMember) return { kind: 'member_exists' };
      const record = await transaction.workspaceInvitation.update({
        where: { organizationId_id: { organizationId, id: invitationId } },
        data: {
          tokenHash,
          invitedById: actorUserId,
          expiresAt,
          acceptedAt: null,
          revokedAt: null,
        },
        select: this.invitationSelection,
      });
      await appendAuditLog(transaction, {
        organizationId,
        actorId: actorUserId,
        actorType: 'user',
        action: 'membership.invitation_resent',
        targetType: 'workspace_invitation',
        targetId: invitationId,
        metadata: { role },
      });
      const context = await transaction.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true },
      });
      const inviter = await transaction.user.findUniqueOrThrow({
        where: { id: actorUserId },
        select: { displayName: true },
      });
      return {
        kind: 'found',
        value: {
          invitation: this.toInvitation(record),
          token,
          workspaceName: context.name,
          inviterName: inviter.displayName,
        },
      };
    });
  }

  revoke(
    organizationId: string,
    actorMembershipId: string,
    actorUserId: string,
    invitationId: string,
  ): Promise<Exclude<InvitationMutationResult, { kind: 'found' }> | { kind: 'found' }> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const manager = await this.lockManager(
        transaction,
        organizationId,
        actorMembershipId,
        actorUserId,
      );
      if (!manager) return { kind: 'forbidden' };
      const invitation = await this.lockInvitation(transaction, organizationId, invitationId);
      if (!invitation) return { kind: 'not_found' };
      const role = ROLE_FROM_DATABASE[invitation.role];
      if (role === 'owner' || !canInviteRole(manager.role, role)) return { kind: 'forbidden' };
      if (!invitation.revokedAt && !invitation.acceptedAt) {
        await transaction.workspaceInvitation.update({
          where: { organizationId_id: { organizationId, id: invitationId } },
          data: { revokedAt: new Date() },
        });
        await appendAuditLog(transaction, {
          organizationId,
          actorId: actorUserId,
          actorType: 'user',
          action: 'membership.invitation_revoked',
          targetType: 'workspace_invitation',
          targetId: invitationId,
          metadata: { role },
        });
      }
      return { kind: 'found' };
    });
  }

  preview(organizationId: string, tokenHash: string): Promise<WorkspaceInvitationPreview | null> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const record = await transaction.workspaceInvitation.findFirst({
        where: {
          organizationId,
          tokenHash,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          organization: { deletedAt: null },
        },
        select: {
          email: true,
          role: true,
          expiresAt: true,
          organization: { select: { id: true, name: true, slug: true } },
          invitedBy: { select: { id: true, displayName: true } },
        },
      });
      if (!record || record.role === 'OWNER') return null;
      return {
        email: record.email,
        role: ROLE_FROM_DATABASE[record.role] as ManageableWorkspaceRole,
        expiresAt: record.expiresAt.toISOString(),
        workspace: record.organization,
        invitedBy: record.invitedBy,
      };
    });
  }

  async accept(
    organizationId: string,
    tokenHash: string,
    userId: string,
  ): Promise<AcceptInvitationResult> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true },
    });
    if (!user) return { kind: 'invalid' };
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM workspace_invitations
        WHERE organization_id = ${organizationId}::uuid
          AND token_hash = ${tokenHash}::char(64)
        FOR UPDATE
      `;
      const invitationId = locked[0]?.id;
      if (!invitationId) return { kind: 'invalid' };
      const invitation = await transaction.workspaceInvitation.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id: invitationId } },
      });
      if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
        return { kind: 'email_mismatch' };
      }
      if (
        invitation.revokedAt ||
        invitation.expiresAt <= new Date() ||
        invitation.role === 'OWNER'
      ) {
        return { kind: 'invalid' };
      }
      const existing = await transaction.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      });
      if (invitation.acceptedAt) {
        if (!existing || existing.deletedAt) return { kind: 'invalid' };
        return this.acceptedResponse(transaction, organizationId, existing.id, invitation.role);
      }
      if (existing && !existing.deletedAt) return { kind: 'member_exists' };
      const membership = existing
        ? await transaction.membership.update({
            where: { organizationId_id: { organizationId, id: existing.id } },
            data: { role: invitation.role, deletedAt: null },
            select: { id: true },
          })
        : await transaction.membership.create({
            data: { organizationId, userId, role: invitation.role },
            select: { id: true },
          });
      await transaction.workspaceInvitation.update({
        where: { organizationId_id: { organizationId, id: invitationId } },
        data: { acceptedAt: new Date() },
      });
      await transaction.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
      await appendAuditLog(transaction, {
        organizationId,
        actorId: userId,
        actorType: 'user',
        action: 'membership.invitation_accepted',
        targetType: 'membership',
        targetId: membership.id,
        metadata: { invitationId, role: ROLE_FROM_DATABASE[invitation.role] },
      });
      return this.acceptedResponse(transaction, organizationId, membership.id, invitation.role);
    });
  }

  private async lockManager(
    transaction: TenantTransaction,
    organizationId: string,
    membershipId: string,
    userId: string,
  ): Promise<{ role: WorkspaceMember['role'] } | undefined> {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM memberships
      WHERE organization_id = ${organizationId}::uuid
        AND id = ${membershipId}::uuid
        AND user_id = ${userId}::uuid
        AND deleted_at IS NULL
      FOR UPDATE
    `;
    if (!locked[0]) return undefined;
    const membership = await transaction.membership.findUniqueOrThrow({
      where: { organizationId_id: { organizationId, id: membershipId } },
      select: { role: true },
    });
    return { role: ROLE_FROM_DATABASE[membership.role] };
  }

  private async lockInvitation(
    transaction: TenantTransaction,
    organizationId: string,
    invitationId: string,
  ) {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM workspace_invitations
      WHERE organization_id = ${organizationId}::uuid
        AND id = ${invitationId}::uuid
      FOR UPDATE
    `;
    if (!locked[0]) return null;
    return transaction.workspaceInvitation.findUnique({
      where: { organizationId_id: { organizationId, id: invitationId } },
    });
  }

  private async acceptedResponse(
    transaction: TenantTransaction,
    organizationId: string,
    membershipId: string,
    role: MembershipRole,
  ): Promise<AcceptInvitationResult> {
    const workspace = await transaction.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true },
    });
    return {
      kind: 'accepted',
      value: {
        workspace,
        membershipId,
        role: ROLE_FROM_DATABASE[role] as ManageableWorkspaceRole,
      },
    };
  }

  private statusWhere(status: WorkspaceInvitationListQuery['status'], now: Date) {
    if (status === 'accepted') return { acceptedAt: { not: null } };
    if (status === 'revoked') return { acceptedAt: null, revokedAt: { not: null } };
    if (status === 'expired') {
      return { acceptedAt: null, revokedAt: null, expiresAt: { lte: now } };
    }
    if (status === 'pending') {
      return { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } };
    }
    return {};
  }

  private readonly invitationSelection = {
    id: true,
    email: true,
    role: true,
    expiresAt: true,
    acceptedAt: true,
    revokedAt: true,
    createdAt: true,
    updatedAt: true,
    invitedBy: { select: { id: true, displayName: true } },
  } as const;

  private toInvitation(
    record: {
      id: string;
      email: string;
      role: MembershipRole;
      expiresAt: Date;
      acceptedAt: Date | null;
      revokedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      invitedBy: { id: string; displayName: string };
    },
    now = new Date(),
  ): WorkspaceInvitation {
    const status = record.acceptedAt
      ? 'accepted'
      : record.revokedAt
        ? 'revoked'
        : record.expiresAt <= now
          ? 'expired'
          : 'pending';
    return {
      id: record.id,
      email: record.email,
      role: ROLE_FROM_DATABASE[record.role] as ManageableWorkspaceRole,
      status,
      expiresAt: record.expiresAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      invitedBy: record.invitedBy,
    };
  }
}
