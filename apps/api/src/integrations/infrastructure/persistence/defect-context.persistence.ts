import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';
import { AttachmentTargetType } from '../../../generated/prisma/enums';

export type DefectAttachment = {
  id: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  stepPosition: number | null;
};

export type DefectContext = {
  projectId: string;
  organizationSlug: string;
  projectSlug: string;
  run: { id: string; name: string; build: string | null };
  itemId: string;
  result: {
    id: string;
    executedAt: Date;
    attempt: number;
    comment: string | null;
    build: string | null;
    status: { key: string; name: string; countsAsFailure: boolean };
    stepResults: Array<{
      position: number;
      comment: string | null;
      status: { name: string; countsAsFailure: boolean };
    }>;
  };
  testCase: {
    id: string;
    caseNumber: string;
    title: string;
    template: string;
    preconditions: string | null;
    expectedResult: string | null;
    content: unknown;
  };
  attachments: DefectAttachment[];
};

export type DefectContextResult =
  | { kind: 'found'; value: DefectContext }
  | { kind: 'project_not_found' }
  | { kind: 'run_not_found' }
  | { kind: 'item_not_found' }
  | { kind: 'result_not_found' }
  | { kind: 'result_not_failed' }
  | { kind: 'attachment_not_found' }
  | { kind: 'attachment_limit_exceeded' };

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function loadDefectContext(
  transaction: TenantTransaction,
  organizationId: string,
  projectSlug: string,
  runId: string,
  itemId: string,
  resultId: string,
  attachmentIds: string[],
): Promise<DefectContextResult> {
  const project = await transaction.project.findUnique({
    where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
    select: { id: true, slug: true, organization: { select: { slug: true } } },
  });
  if (!project) return { kind: 'project_not_found' };
  const run = await transaction.testRun.findFirst({
    where: { organizationId, id: runId, projectId: project.id, deletedAt: null },
    select: { id: true, name: true, build: true },
  });
  if (!run) return { kind: 'run_not_found' };
  const item = await transaction.testRunItem.findFirst({
    where: { organizationId, id: itemId, testRunId: runId },
    select: {
      id: true,
      caseVersion: {
        select: {
          title: true,
          template: true,
          preconditions: true,
          expectedResult: true,
          content: true,
          testCase: { select: { id: true, caseNumber: true } },
        },
      },
    },
  });
  if (!item) return { kind: 'item_not_found' };
  const result = await transaction.testResult.findFirst({
    where: { organizationId, id: resultId, testRunItemId: itemId },
    select: {
      id: true,
      executedAt: true,
      attempt: true,
      comment: true,
      build: true,
      status: { select: { key: true, name: true, countsAsFailure: true } },
      stepResults: {
        orderBy: { position: 'asc' },
        select: {
          position: true,
          comment: true,
          status: { select: { name: true, countsAsFailure: true } },
        },
      },
    },
  });
  if (!result) return { kind: 'result_not_found' };
  if (!result.status.countsAsFailure) return { kind: 'result_not_failed' };

  const attachmentRecords =
    attachmentIds.length === 0
      ? []
      : await transaction.attachment.findMany({
          where: {
            organizationId,
            id: { in: attachmentIds },
            targetType: AttachmentTargetType.RESULT,
            targetId: resultId,
            deletedAt: null,
          },
          select: {
            id: true,
            blob: { select: { storageKey: true } },
            fileName: true,
            contentType: true,
            sizeBytes: true,
            stepPosition: true,
          },
        });
  if (attachmentRecords.length !== attachmentIds.length) return { kind: 'attachment_not_found' };
  const attachmentById = new Map(
    attachmentRecords.map((attachment) => [attachment.id, attachment]),
  );
  const attachments = attachmentIds.flatMap((id) => {
    const attachment = attachmentById.get(id);
    return attachment
      ? [
          {
            id: attachment.id,
            storageKey: attachment.blob.storageKey,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            sizeBytes: Number(attachment.sizeBytes),
            stepPosition: attachment.stepPosition,
          },
        ]
      : [];
  });
  if (
    attachments.some(({ sizeBytes }) => sizeBytes > MAX_ATTACHMENT_BYTES) ||
    attachments.reduce((total, { sizeBytes }) => total + sizeBytes, 0) > MAX_TOTAL_ATTACHMENT_BYTES
  ) {
    return { kind: 'attachment_limit_exceeded' };
  }

  return {
    kind: 'found',
    value: {
      projectId: project.id,
      organizationSlug: project.organization.slug,
      projectSlug: project.slug,
      run,
      itemId: item.id,
      result,
      testCase: {
        id: item.caseVersion.testCase.id,
        caseNumber: item.caseVersion.testCase.caseNumber.toString(),
        title: item.caseVersion.title,
        template: item.caseVersion.template.toLowerCase(),
        preconditions: item.caseVersion.preconditions,
        expectedResult: item.caseVersion.expectedResult,
        content: item.caseVersion.content,
      },
      attachments,
    },
  };
}
