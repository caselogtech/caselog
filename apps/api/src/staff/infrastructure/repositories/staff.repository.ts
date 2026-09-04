import { Inject, Injectable } from '@nestjs/common';
import type {
  GrantStaffOperatorRequest,
  StaffAuditLog,
  StaffBillingAccount,
  StaffListQuery,
  StaffOperator,
  StaffOverviewResponse,
  StaffUser,
  StaffWorkspace,
} from '@caselog/schemas';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';
import {
  type GrantStaffOperatorRow,
  mapStaffAuditLog,
  mapStaffBillingAccount,
  mapStaffOperator,
  mapStaffUser,
  mapStaffWorkspace,
  type StaffAuditLogRow,
  type StaffBillingAccountRow,
  type StaffOperatorRow,
  type StaffOverviewRow,
  type StaffPage,
  type StaffUserRow,
  type StaffWorkspaceRow,
  toStaffPage,
} from './staff-projection.mapper';

export type { StaffPage } from './staff-projection.mapper';
export type GrantStaffOperatorResult =
  | { kind: 'ok'; operator: StaffOperator }
  | { kind: 'user_not_found' | 'invalid_expiry' | 'last_owner' };
export type RevokeStaffOperatorResult =
  | { kind: 'ok' }
  | { kind: 'not_found' | 'self_revoke' | 'last_owner' };

@Injectable()
export class StaffRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async current(userId: string): Promise<StaffOperator | undefined> {
    const rows = await this.withUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<StaffOperatorRow[]>`
        SELECT
          user_id AS "userId", email, display_name AS "displayName", role,
          access_expires_at AS "accessExpiresAt", disabled_at AS "disabledAt",
          created_at AS "createdAt"
        FROM public.current_user_staff_operator()
      `,
    );
    return rows[0] ? mapStaffOperator(rows[0]) : undefined;
  }

  async bootstrap(
    userId: string,
    configuredEmail: string,
    expiresAt: Date,
  ): Promise<StaffOperator | undefined> {
    const rows = await this.withUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<StaffOperatorRow[]>`
        SELECT
          user_id AS "userId", email, display_name AS "displayName", role,
          access_expires_at AS "accessExpiresAt", disabled_at AS "disabledAt",
          created_at AS "createdAt"
        FROM public.bootstrap_current_user_staff_operator(
          ${configuredEmail}::CITEXT,
          ${expiresAt}::TIMESTAMPTZ
        )
      `,
    );
    return rows[0] ? mapStaffOperator(rows[0]) : undefined;
  }

  async overview(userId: string): Promise<Omit<StaffOverviewResponse, 'configuration'>> {
    const rows = await this.withUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<StaffOverviewRow[]>`
        SELECT
          user_count AS "userCount", active_workspace_count AS "activeWorkspaceCount",
          deleted_workspace_count AS "deletedWorkspaceCount",
          billing_account_count AS "billingAccountCount",
          active_project_count AS "activeProjectCount", storage_bytes AS "storageBytes"
        FROM public.staff_overview()
      `,
    );
    const row = rows[0];
    if (!row) throw new Error('Staff overview returned no row');
    return {
      metrics: {
        users: Number(row.userCount),
        activeWorkspaces: Number(row.activeWorkspaceCount),
        deletedWorkspaces: Number(row.deletedWorkspaceCount),
        billingAccounts: Number(row.billingAccountCount),
        activeProjects: Number(row.activeProjectCount),
        storageBytes: row.storageBytes.toString(),
      },
    };
  }

  async listUsers(userId: string, query: StaffListQuery): Promise<StaffPage<StaffUser>> {
    const rows = await this.withUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<StaffUserRow[]>`
        SELECT
          id, email, display_name AS "displayName", email_verified AS "emailVerified",
          active_workspace_count AS "activeWorkspaceCount",
          billing_account_count AS "billingAccountCount",
          created_at AS "createdAt", deleted_at AS "deletedAt"
        FROM public.list_staff_users(
          ${query.cursor ?? null}::UUID,
          ${query.limit + 1}::INTEGER,
          ${query.q ?? null}::TEXT
        )
      `,
    );
    return toStaffPage(rows.map(mapStaffUser), query.limit, (user) => user.id);
  }

  async listWorkspaces(userId: string, query: StaffListQuery): Promise<StaffPage<StaffWorkspace>> {
    const rows = await this.withUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<StaffWorkspaceRow[]>`
        SELECT
          id, name, slug, billing_account_id AS "billingAccountId",
          billing_account_name AS "billingAccountName", member_count AS "memberCount",
          project_count AS "projectCount", storage_bytes AS "storageBytes",
          created_at AS "createdAt", deleted_at AS "deletedAt"
        FROM public.list_staff_workspaces(
          ${query.cursor ?? null}::UUID,
          ${query.limit + 1}::INTEGER,
          ${query.q ?? null}::TEXT
        )
      `,
    );
    return toStaffPage(rows.map(mapStaffWorkspace), query.limit, (workspace) => workspace.id);
  }

  async listBillingAccounts(
    userId: string,
    query: StaffListQuery,
  ): Promise<StaffPage<StaffBillingAccount>> {
    const rows = await this.withUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<StaffBillingAccountRow[]>`
        SELECT
          id, name, owner_email AS "ownerEmail", member_count AS "memberCount",
          workspace_count AS "workspaceCount", storage_bytes AS "storageBytes",
          created_at AS "createdAt"
        FROM public.list_staff_billing_accounts(
          ${query.cursor ?? null}::UUID,
          ${query.limit + 1}::INTEGER,
          ${query.q ?? null}::TEXT
        )
      `,
    );
    return toStaffPage(rows.map(mapStaffBillingAccount), query.limit, (account) => account.id);
  }

  async listOperators(userId: string, query: StaffListQuery): Promise<StaffPage<StaffOperator>> {
    const rows = await this.withUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<StaffOperatorRow[]>`
        SELECT
          user_id AS "userId", email, display_name AS "displayName", role,
          access_expires_at AS "accessExpiresAt", disabled_at AS "disabledAt",
          created_at AS "createdAt"
        FROM public.list_staff_operators(${query.cursor ?? null}::UUID, ${query.limit + 1}::INTEGER)
      `,
    );
    return toStaffPage(rows.map(mapStaffOperator), query.limit, (operator) => operator.userId);
  }

  async grantOperator(
    userId: string,
    request: GrantStaffOperatorRequest,
  ): Promise<GrantStaffOperatorResult> {
    const rows = await this.withUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<GrantStaffOperatorRow[]>`
        SELECT
          outcome, user_id AS "userId", email, display_name AS "displayName", role,
          access_expires_at AS "accessExpiresAt", disabled_at AS "disabledAt",
          created_at AS "createdAt"
        FROM public.grant_staff_operator(
          ${request.email}::CITEXT,
          ${request.role}::public.staff_operator_role,
          ${new Date(request.accessExpiresAt)}::TIMESTAMPTZ,
          ${request.reason}::VARCHAR(500)
        )
      `,
    );
    const row = rows[0];
    if (!row) throw new Error('Staff operator grant returned no outcome');
    if (row.outcome !== 'ok') {
      return { kind: row.outcome as Exclude<GrantStaffOperatorResult['kind'], 'ok'> };
    }
    return { kind: 'ok', operator: mapStaffOperator(row) };
  }

  async revokeOperator(
    userId: string,
    targetUserId: string,
    reason: string,
  ): Promise<RevokeStaffOperatorResult> {
    const rows = await this.withUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<Array<{ outcome: RevokeStaffOperatorResult['kind'] }>>`
        SELECT public.revoke_staff_operator(
          ${targetUserId}::UUID,
          ${reason}::VARCHAR(500)
        ) AS outcome
      `,
    );
    return { kind: rows[0]?.outcome ?? 'not_found' };
  }

  async listAuditLogs(userId: string, query: StaffListQuery): Promise<StaffPage<StaffAuditLog>> {
    const rows = await this.withUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<StaffAuditLogRow[]>`
        SELECT
          id, actor_user_id AS "actorUserId", actor_email AS "actorEmail",
          actor_display_name AS "actorDisplayName", action, target_type AS "targetType",
          target_id AS "targetId", reason, metadata, created_at AS "createdAt"
        FROM public.list_staff_audit_logs(${query.cursor ?? null}::UUID, ${query.limit + 1}::INTEGER)
      `,
    );
    return toStaffPage(rows.map(mapStaffAuditLog), query.limit, (auditLog) => auditLog.id);
  }

  private withUser<T>(
    userId: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT set_config('caselog.user_id', ${userId}, true)`;
      return operation(transaction);
    });
  }
}
