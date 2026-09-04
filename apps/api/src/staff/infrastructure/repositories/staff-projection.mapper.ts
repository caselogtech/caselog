import type {
  StaffAuditLog,
  StaffBillingAccount,
  StaffOperator,
  StaffUser,
  StaffWorkspace,
} from '@caselog/schemas';
import type { Prisma } from '../../../generated/prisma/client';

export type StaffOperatorRow = {
  userId: string;
  email: string;
  displayName: string;
  role: StaffOperator['role'];
  accessExpiresAt: Date;
  disabledAt: Date | null;
  createdAt: Date;
};

export type StaffOverviewRow = {
  userCount: bigint;
  activeWorkspaceCount: bigint;
  deletedWorkspaceCount: bigint;
  billingAccountCount: bigint;
  activeProjectCount: bigint;
  storageBytes: { toString(): string };
};

export type StaffUserRow = Omit<
  StaffUser,
  'emailVerified' | 'activeWorkspaceCount' | 'billingAccountCount' | 'createdAt' | 'deletedAt'
> & {
  emailVerified: boolean;
  activeWorkspaceCount: bigint;
  billingAccountCount: bigint;
  createdAt: Date;
  deletedAt: Date | null;
};

export type StaffWorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  billingAccountId: string | null;
  billingAccountName: string | null;
  memberCount: bigint;
  projectCount: bigint;
  storageBytes: { toString(): string };
  createdAt: Date;
  deletedAt: Date | null;
};

export type StaffBillingAccountRow = {
  id: string;
  name: string;
  ownerEmail: string;
  memberCount: bigint;
  workspaceCount: bigint;
  storageBytes: { toString(): string };
  createdAt: Date;
};

export type GrantStaffOperatorRow = StaffOperatorRow & { outcome: string };

export type StaffAuditLogRow = {
  id: string;
  actorUserId: string;
  actorEmail: string;
  actorDisplayName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export type StaffPage<T> = { items: T[]; nextCursor: string | null };

export function toStaffPage<T>(
  rows: T[],
  limit: number,
  cursor: (item: T) => string,
): StaffPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? cursor(items[items.length - 1] as T) : null };
}

export function mapStaffOperator(row: StaffOperatorRow): StaffOperator {
  return {
    userId: row.userId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    accessExpiresAt: row.accessExpiresAt.toISOString(),
    disabledAt: row.disabledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapStaffUser(row: StaffUserRow): StaffUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    emailVerified: row.emailVerified,
    activeWorkspaceCount: Number(row.activeWorkspaceCount),
    billingAccountCount: Number(row.billingAccountCount),
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export function mapStaffWorkspace(row: StaffWorkspaceRow): StaffWorkspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    billingAccount:
      row.billingAccountId && row.billingAccountName
        ? { id: row.billingAccountId, name: row.billingAccountName }
        : null,
    memberCount: Number(row.memberCount),
    projectCount: Number(row.projectCount),
    storageBytes: row.storageBytes.toString(),
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export function mapStaffBillingAccount(row: StaffBillingAccountRow): StaffBillingAccount {
  return {
    id: row.id,
    name: row.name,
    ownerEmail: row.ownerEmail,
    memberCount: Number(row.memberCount),
    workspaceCount: Number(row.workspaceCount),
    storageBytes: row.storageBytes.toString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapStaffAuditLog(row: StaffAuditLogRow): StaffAuditLog {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata
      : {};
  return {
    id: row.id,
    actor: {
      userId: row.actorUserId,
      email: row.actorEmail,
      displayName: row.actorDisplayName,
    },
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    metadata,
    createdAt: row.createdAt.toISOString(),
  };
}
