import type { IssueLink } from '@caselog/schemas';

export type IssueLinkRecord = {
  id: string;
  connectionId: string;
  linkType: string;
  externalIssueId: string;
  externalIssueKey: string;
  title: string;
  url: string;
  issueType: string;
  statusId: string | null;
  statusName: string | null;
  lastSyncedAt: Date | null;
  lastSyncAttemptAt: Date | null;
  syncError: string | null;
  createdAt: Date;
};

export const issueLinkSelection = {
  id: true,
  connectionId: true,
  linkType: true,
  externalIssueId: true,
  externalIssueKey: true,
  title: true,
  url: true,
  issueType: true,
  statusId: true,
  statusName: true,
  lastSyncedAt: true,
  lastSyncAttemptAt: true,
  syncError: true,
  createdAt: true,
} as const;

export function toIssueLink(record: IssueLinkRecord): IssueLink {
  return {
    id: record.id,
    connectionId: record.connectionId,
    linkType: record.linkType as IssueLink['linkType'],
    externalIssueId: record.externalIssueId,
    externalIssueKey: record.externalIssueKey,
    title: record.title,
    url: record.url,
    issueType: record.issueType,
    status:
      record.statusId && record.statusName
        ? { id: record.statusId, name: record.statusName }
        : null,
    lastSyncedAt: record.lastSyncedAt?.toISOString() ?? null,
    lastSyncAttemptAt: record.lastSyncAttemptAt?.toISOString() ?? null,
    syncError: record.syncError,
    createdAt: record.createdAt.toISOString(),
  };
}
