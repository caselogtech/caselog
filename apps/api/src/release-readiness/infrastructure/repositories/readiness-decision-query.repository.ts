import { Inject, Injectable } from '@nestjs/common';
import type {
  CandidateReadinessResponse,
  ReadinessDecisionListQuery,
  ReadinessDecisionListResponse,
  ReadinessDecisionResponse,
} from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  hydrateReadinessDecisions,
  loadCurrentReadiness,
} from '../persistence/readiness-decision-hydration.persistence';
import {
  READINESS_DECISION_SCALAR_SELECTION,
  toCandidateReadinessResponse,
  toReadinessDecision,
} from '../persistence/readiness-decision.persistence';

export type CurrentReadinessResult =
  | { kind: 'found'; value: CandidateReadinessResponse }
  | { kind: 'projection_not_found' };

export type ReadinessDecisionHistoryResult =
  | { kind: 'found'; value: ReadinessDecisionListResponse }
  | { kind: 'project_not_found' | 'candidate_not_found' | 'cursor_not_found' };

export type ReadinessDecisionDetailResult =
  | { kind: 'found'; value: ReadinessDecisionResponse }
  | { kind: 'project_not_found' | 'decision_not_found' };

@Injectable()
export class ReadinessDecisionQueryRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  current(
    organizationId: string,
    candidateId: string,
    currentEvidenceRevision: number,
  ): Promise<CurrentReadinessResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const current = await loadCurrentReadiness(transaction, organizationId, candidateId);
      return current
        ? {
            kind: 'found',
            value: toCandidateReadinessResponse(current, currentEvidenceRevision),
          }
        : { kind: 'projection_not_found' };
    });
  }

  history(input: {
    organizationId: string;
    projectId: string;
    projectSlug: string;
    candidateId: string;
    query: ReadinessDecisionListQuery;
  }): Promise<ReadinessDecisionHistoryResult> {
    return this.tenantDatabase.run(input.organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: {
          organizationId_slug: {
            organizationId: input.organizationId,
            slug: input.projectSlug,
          },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      if (project.id !== input.projectId) return { kind: 'candidate_not_found' };
      const filters = { projectId: project.id, candidateId: input.candidateId };
      const cursor = input.query.cursor
        ? await transaction.readinessDecision.findFirst({
            where: { ...filters, id: input.query.cursor },
            select: { id: true, evaluatedAt: true },
          })
        : null;
      if (input.query.cursor && !cursor) return { kind: 'cursor_not_found' };
      const records = await transaction.readinessDecision.findMany({
        where: {
          ...filters,
          ...(cursor
            ? {
                OR: [
                  { evaluatedAt: { lt: cursor.evaluatedAt } },
                  { evaluatedAt: cursor.evaluatedAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }],
        take: input.query.limit + 1,
        select: READINESS_DECISION_SCALAR_SELECTION,
      });
      const hasMore = records.length > input.query.limit;
      const page = records.slice(0, input.query.limit);
      const hydrated = await hydrateReadinessDecisions(transaction, page);
      return {
        kind: 'found',
        value: {
          items: hydrated.map((decision) => toReadinessDecision(decision)),
          nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }

  detail(input: {
    organizationId: string;
    projectSlug: string;
    decisionId: string;
  }): Promise<ReadinessDecisionDetailResult> {
    return this.tenantDatabase.run(input.organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: {
          organizationId_slug: {
            organizationId: input.organizationId,
            slug: input.projectSlug,
          },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const record = await transaction.readinessDecision.findFirst({
        where: { id: input.decisionId, projectId: project.id },
        select: READINESS_DECISION_SCALAR_SELECTION,
      });
      if (!record) return { kind: 'decision_not_found' };
      const [hydrated] = await hydrateReadinessDecisions(transaction, [record]);
      return hydrated
        ? { kind: 'found', value: { decision: toReadinessDecision(hydrated) } }
        : { kind: 'decision_not_found' };
    });
  }
}
