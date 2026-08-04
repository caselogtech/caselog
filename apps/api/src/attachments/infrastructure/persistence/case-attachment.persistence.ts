import type { CaseAttachment } from '@caselog/schemas';
import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';

export const caseAttachmentSelect = {
  id: true,
  fileName: true,
  contentType: true,
  sizeBytes: true,
  checksumSha256: true,
  createdAt: true,
} as const;

export type CaseVersionAttachmentContext = {
  projectId: string;
  caseId: string;
  versionId: string;
};

export async function findCaseVersionAttachmentContext(
  transaction: TenantTransaction,
  organizationId: string,
  projectSlug: string,
  caseId: string,
  versionId: string,
): Promise<CaseVersionAttachmentContext | null> {
  const version = await transaction.testCaseVersion.findUnique({
    where: {
      organizationId_id: { organizationId, id: versionId },
      testCaseId: caseId,
      testCase: {
        organizationId,
        deletedAt: null,
        project: { organizationId, slug: projectSlug, deletedAt: null },
      },
    },
    select: { id: true, testCase: { select: { id: true, projectId: true } } },
  });
  if (!version) return null;
  return {
    projectId: version.testCase.projectId,
    caseId: version.testCase.id,
    versionId: version.id,
  };
}

export function toCaseAttachment(attachment: {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: bigint;
  checksumSha256: string;
  createdAt: Date;
}): CaseAttachment {
  return {
    ...attachment,
    contentType: attachment.contentType as CaseAttachment['contentType'],
    sizeBytes: Number(attachment.sizeBytes),
    createdAt: attachment.createdAt.toISOString(),
  };
}
