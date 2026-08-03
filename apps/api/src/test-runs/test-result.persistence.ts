import { testResultResponseSchema } from '@caselog/schemas';
import type { TenantTransaction } from '../core/database/tenant-database.service';
import { AttachmentTargetType } from '../generated/prisma/enums';
import type {
  AttachmentRecord,
  MatchableRunItem,
  ResultRecord,
  RunItemIndex,
} from './test-run.repository.types';

export function matchableRunItems(
  transaction: TenantTransaction,
  organizationId: string,
  runId: string,
): Promise<MatchableRunItem[]> {
  return transaction.testRunItem.findMany({
    where: { organizationId, testRunId: runId },
    select: {
      id: true,
      caseVersion: {
        select: {
          testCase: { select: { automationId: true, caseNumber: true } },
        },
      },
    },
  });
}

export function indexRunItems(items: MatchableRunItem[]): RunItemIndex {
  const index: RunItemIndex = {
    byId: new Map(),
    byAutomationId: new Map(),
    byCaseNumber: new Map(),
  };
  for (const item of items) {
    index.byId.set(item.id, item);
    const { automationId, caseNumber } = item.caseVersion.testCase;
    if (automationId) {
      const matches = index.byAutomationId.get(automationId) ?? [];
      matches.push(item);
      index.byAutomationId.set(automationId, matches);
    }
    const normalizedCaseNumber = caseNumber.toString();
    const matches = index.byCaseNumber.get(normalizedCaseNumber) ?? [];
    matches.push(item);
    index.byCaseNumber.set(normalizedCaseNumber, matches);
  }
  return index;
}

export function matchExternalRunItem(
  index: RunItemIndex,
  automationId: string | undefined,
  caseNumber: string | undefined,
): MatchableRunItem[] {
  let matches = automationId ? (index.byAutomationId.get(automationId) ?? []) : [];
  if (matches.length > 1 && caseNumber) {
    matches = matches.filter(
      (item) => item.caseVersion.testCase.caseNumber.toString() === caseNumber,
    );
  } else if (matches.length === 0 && caseNumber) {
    matches = index.byCaseNumber.get(caseNumber) ?? [];
  }
  return matches;
}

export function resultSelection() {
  return {
    id: true,
    attempt: true,
    comment: true,
    elapsedMs: true,
    executedAt: true,
    executedBy: { select: { id: true, displayName: true } },
    status: {
      select: {
        id: true,
        key: true,
        name: true,
        color: true,
        isFinal: true,
        countsAsFailure: true,
      },
    },
    stepResults: {
      orderBy: { position: 'asc' as const },
      select: {
        id: true,
        position: true,
        comment: true,
        elapsedMs: true,
        status: {
          select: {
            id: true,
            key: true,
            name: true,
            color: true,
            isFinal: true,
            countsAsFailure: true,
          },
        },
      },
    },
  } as const;
}

export async function resultAttachments(
  transaction: TenantTransaction,
  resultIds: string[],
): Promise<Map<string, AttachmentRecord[]>> {
  const byResult = new Map<string, AttachmentRecord[]>();
  if (resultIds.length === 0) return byResult;
  const attachments = await transaction.attachment.findMany({
    where: {
      targetType: AttachmentTargetType.RESULT,
      targetId: { in: resultIds },
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      targetId: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      checksumSha256: true,
      stepPosition: true,
    },
  });
  for (const { targetId, sizeBytes, ...attachment } of attachments) {
    const current = byResult.get(targetId) ?? [];
    current.push({ ...attachment, sizeBytes: Number(sizeBytes) });
    byResult.set(targetId, current);
  }
  return byResult;
}

export function toTestResult(result: ResultRecord, attachments: AttachmentRecord[] = []) {
  return testResultResponseSchema.parse({
    ...result,
    status: result.status,
    executedAt: result.executedAt.toISOString(),
    stepResults: result.stepResults.map(({ status, ...step }) => ({
      ...step,
      status,
    })),
    attachments,
  });
}
