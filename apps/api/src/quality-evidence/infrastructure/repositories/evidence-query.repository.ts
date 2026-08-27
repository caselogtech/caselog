import { Inject, Injectable } from '@nestjs/common';
import {
  evidenceProcessingIssueCodeSchema,
  type EvidenceListQuery,
  type EvidenceListResponse,
} from '@caselog/schemas/evidence';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  EvidenceObservationState,
  EvidenceTrustLevel,
  type Prisma,
} from '../../../generated/prisma/client';
import {
  EVIDENCE_OBSERVATION_SELECTION,
  toEvidenceObservation,
} from '../persistence/evidence-observation.persistence';

export type EvidenceListResult =
  | { kind: 'found'; value: EvidenceListResponse }
  | { kind: 'project_not_found' | 'candidate_not_found' | 'cursor_not_found' };

@Injectable()
export class EvidenceQueryRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  list(
    organizationId: string,
    projectSlug: string,
    query: EvidenceListQuery,
  ): Promise<EvidenceListResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const candidate = await transaction.releaseCandidate.findFirst({
        where: { id: query.candidateId, projectId: project.id },
        select: { id: true },
      });
      if (!candidate) return { kind: 'candidate_not_found' };

      const now = new Date();
      const filters = {
        projectId: project.id,
        candidateId: candidate.id,
        metricKey: query.metricKey,
        producer: query.producerKey ? { producerKey: query.producerKey } : undefined,
        sourceType: query.sourceType,
        trustLevel: query.trust
          ? EvidenceTrustLevel[query.trust.toUpperCase() as keyof typeof EvidenceTrustLevel]
          : undefined,
        state: query.state
          ? EvidenceObservationState[
              query.state.toUpperCase() as keyof typeof EvidenceObservationState
            ]
          : undefined,
        observedAt:
          query.observedAfter || query.observedBefore
            ? {
                gte: query.observedAfter ? new Date(query.observedAfter) : undefined,
                lte: query.observedBefore ? new Date(query.observedBefore) : undefined,
              }
            : undefined,
        expiresAt: query.freshness === 'stale' ? { lte: now } : undefined,
        currentFor: query.currentOnly ? { isNot: null } : undefined,
      } satisfies Prisma.EvidenceObservationWhereInput;
      const cursor = query.cursor
        ? await transaction.evidenceObservation.findFirst({
            where: { ...filters, id: query.cursor },
            select: { id: true, createdAt: true },
          })
        : null;
      if (query.cursor && !cursor) return { kind: 'cursor_not_found' };

      const constraints: Prisma.EvidenceObservationWhereInput[] = [
        ...(query.freshness === 'current'
          ? [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }]
          : []),
        ...(cursor
          ? [
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ]
          : []),
      ];
      const records = await transaction.evidenceObservation.findMany({
        where: {
          ...filters,
          ...(constraints.length > 0 ? { AND: constraints } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: EVIDENCE_OBSERVATION_SELECTION,
      });
      const [revision, issues] = await Promise.all([
        transaction.candidateEvidenceRevision.findUnique({
          where: {
            organizationId_candidateId: { organizationId, candidateId: candidate.id },
          },
          select: { revision: true },
        }),
        transaction.evidenceProcessingIssue.findMany({
          where: {
            projectId: project.id,
            candidateId: candidate.id,
            resolvedAt: null,
          },
          orderBy: [{ lastFailedAt: 'desc' }, { id: 'desc' }],
          take: 25,
          select: {
            id: true,
            code: true,
            attemptCount: true,
            firstFailedAt: true,
            lastFailedAt: true,
            sourceEvent: {
              select: {
                id: true,
                eventName: true,
                sourceType: true,
                sourceId: true,
                sourceRevision: true,
              },
            },
          },
        }),
      ]);
      const hasMore = records.length > query.limit;
      const page = records.slice(0, query.limit);
      return {
        kind: 'found',
        value: {
          candidateId: candidate.id,
          candidateRevision: revision?.revision ?? 0,
          items: page.map((record) => toEvidenceObservation(record, now)),
          issues: issues.map((issue) => ({
            id: issue.id,
            stage: 'ingestion',
            code: evidenceProcessingIssueCodeSchema.parse(issue.code),
            attempts: issue.attemptCount,
            source: {
              eventId: issue.sourceEvent.id,
              eventName: issue.sourceEvent.eventName,
              type: issue.sourceEvent.sourceType,
              id: issue.sourceEvent.sourceId,
              revision: issue.sourceEvent.sourceRevision,
            },
            firstFailedAt: issue.firstFailedAt.toISOString(),
            lastFailedAt: issue.lastFailedAt.toISOString(),
          })),
          nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }
}
