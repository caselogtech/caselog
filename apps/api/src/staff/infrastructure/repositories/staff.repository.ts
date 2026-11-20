import { Inject, Injectable } from '@nestjs/common';
import type {
  GrantStaffOperatorRequest,
  StaffAuditLog,
  StaffBillingAccount,
  StaffListQuery,
  StaffOperator,
  StaffOverviewResponse,
  StaffUser,
  StaffUserDetailResponse,
  StaffUserDetailQuery,
  StaffWorkspace,
  StaffWorkspaceDetailResponse,
  StaffWorkspaceListQuery,
} from '@caselog/schemas';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';
import {
  type GrantStaffOperatorRow,
  mapStaffAuditLog,
  mapStaffBillingAccount,
  mapStaffOperator,
  mapStaffUser,
  mapStaffUserWorkspaces,
  type StaffUserDetailRow,
  mapStaffWorkspace,
  type StaffAuditLogRow,
  type StaffBillingAccountRow,
  type StaffOperatorRow,
  type StaffOverviewRow,
  type StaffPage,
  type StaffUserRow,
  type StaffWorkspaceRow,
  type StaffWorkspaceDetailRow,
  mapStaffWorkspaceDetail,
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

  async userDetail(
    actorId: string,
    userId: string,
    query: StaffUserDetailQuery,
  ): Promise<StaffUserDetailResponse | undefined> {
    const rows = await this.withUser(
      actorId,
      (transaction) => transaction.$queryRaw<StaffUserDetailRow[]>`
      SELECT identity.id, identity.email, identity.display_name AS "displayName",
        identity.email_verified AS "emailVerified", identity.active_workspace_count AS "activeWorkspaceCount",
        identity.billing_account_count AS "billingAccountCount", identity.created_at AS "createdAt", identity.deleted_at AS "deletedAt",
        workspace.id AS "workspaceId", workspace.name AS "workspaceName", workspace.slug AS "workspaceSlug",
        workspace.role AS "workspaceRole", workspace.deleted_at AS "workspaceDeletedAt"
      FROM public.staff_user_details(${userId}::UUID) AS identity
      LEFT JOIN LATERAL public.staff_user_workspaces(identity.id, ${query.cursor ?? null}::UUID, ${query.limit + 1}::INTEGER) AS workspace ON TRUE
      ORDER BY workspace.id
    `,
    );
    const first = rows[0];
    if (!first) return undefined;
    const page = toStaffPage(
      mapStaffUserWorkspaces(rows),
      query.limit,
      (workspace) => workspace.id,
    );
    return { user: mapStaffUser(first), workspaces: page.items, nextCursor: page.nextCursor };
  }

  async listWorkspaces(
    userId: string,
    query: StaffWorkspaceListQuery,
  ): Promise<StaffPage<StaffWorkspace>> {
    const rows = await this.withUser(
      userId,
      (transaction) =>
        transaction.$queryRaw<StaffWorkspaceRow[]>`
        SELECT
          id, name, slug, billing_account_id AS "billingAccountId",
          billing_account_name AS "billingAccountName", member_count AS "memberCount",
          project_count AS "projectCount", storage_bytes AS "storageBytes",
          created_at AS "createdAt", deleted_at AS "deletedAt"
          , owner_user_id AS "ownerUserId", owner_email AS "ownerEmail", owner_display_name AS "ownerDisplayName"
        FROM public.list_staff_workspace_customers(
          ${query.cursor ?? null}::UUID,
          ${query.limit + 1}::INTEGER,
          ${query.q ?? null}::TEXT,
          ${query.state}::TEXT
        )
      `,
    );
    return toStaffPage(rows.map(mapStaffWorkspace), query.limit, (workspace) => workspace.id);
  }

  async workspaceDetail(
    userId: string,
    workspaceId: string,
  ): Promise<StaffWorkspaceDetailResponse | undefined> {
    const rows = await this.withUser(
      userId,
      (transaction) => transaction.$queryRaw<StaffWorkspaceDetailRow[]>`
      SELECT workspace.id, workspace.name, workspace.slug,
        workspace.billing_account_id AS "billingAccountId", workspace.billing_account_name AS "billingAccountName",
        workspace.member_count AS "memberCount", workspace.project_count AS "projectCount",
        workspace.storage_bytes AS "storageBytes", workspace.created_at AS "createdAt", workspace.deleted_at AS "deletedAt",
        workspace.owner_user_id AS "ownerUserId", workspace.owner_email AS "ownerEmail", workspace.owner_display_name AS "ownerDisplayName",
        usage.test_case_count AS "testCaseCount", usage.test_run_count AS "testRunCount", usage.open_test_run_count AS "openTestRunCount",
        usage.ingestion_count AS "ingestionCount", usage.pending_upload_count AS "pendingUploadCount",
        usage.pending_storage_bytes AS "pendingStorageBytes", usage.observed_at AS "observedAt"
      FROM public.list_staff_workspace_customers(NULL, 1, NULL, 'all', ${workspaceId}::UUID) AS workspace
      CROSS JOIN LATERAL public.staff_workspace_usage(workspace.id) AS usage
    `,
    );
    return rows[0] ? mapStaffWorkspaceDetail(rows[0]) : undefined;
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
