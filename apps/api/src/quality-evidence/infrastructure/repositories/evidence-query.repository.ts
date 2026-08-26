import { Inject, Injectable } from '@nestjs/common';
import type { EvidenceListQuery, EvidenceListResponse } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type { Prisma } from '../../../generated/prisma/client';
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

      const filters = {
        projectId: project.id,
        candidateId: candidate.id,
        metricKey: query.metricKey,
        currentFor: query.currentOnly ? { isNot: null } : undefined,
      } satisfies Prisma.EvidenceObservationWhereInput;
      const cursor = query.cursor
        ? await transaction.evidenceObservation.findFirst({
            where: { ...filters, id: query.cursor },
            select: { id: true, createdAt: true },
          })
        : null;
      if (query.cursor && !cursor) return { kind: 'cursor_not_found' };

      const records = await transaction.evidenceObservation.findMany({
        where: {
          ...filters,
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
        select: EVIDENCE_OBSERVATION_SELECTION,
      });
      const revision = await transaction.candidateEvidenceRevision.findUnique({
        where: {
          organizationId_candidateId: { organizationId, candidateId: candidate.id },
        },
        select: { revision: true },
      });
      const hasMore = records.length > query.limit;
      const page = records.slice(0, query.limit);
      const now = new Date();
      return {
        kind: 'found',
        value: {
          candidateId: candidate.id,
          candidateRevision: revision?.revision ?? 0,
          items: page.map((record) => toEvidenceObservation(record, now)),
          nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }
}
