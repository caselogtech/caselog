import { Inject, Injectable } from '@nestjs/common';
import type {
  ReadinessWaiverListQuery,
  ReadinessWaiverListResponse,
  ReadinessWaiverScope,
} from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type {
  WaiverComputedStatus,
  WaiverGateResult,
} from '../../domain/policies/readiness-waiver.policy';
import {
  READINESS_WAIVER_SELECTION,
  toReadinessWaiver,
} from '../persistence/readiness-waiver.persistence';

export type ReadinessWaiverTargetResult =
  | {
      kind: 'found';
      value: {
        projectId: string;
        candidateId: string;
        decisionStatus: WaiverComputedStatus;
        gateResult: WaiverGateResult | null;
      };
    }
  | { kind: 'project_not_found' | 'decision_not_found' | 'gate_evaluation_not_found' };

export type ReadinessWaiverListResult =
  | { kind: 'found'; value: ReadinessWaiverListResponse }
  | { kind: 'project_not_found' | 'decision_not_found' | 'cursor_not_found' };

@Injectable()
export class ReadinessWaiverQueryRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  target(input: {
    organizationId: string;
    projectSlug: string;
    decisionId: string;
    scope: ReadinessWaiverScope;
  }): Promise<ReadinessWaiverTargetResult> {
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
      const decision = await transaction.readinessDecision.findFirst({
        where: { id: input.decisionId, projectId: project.id },
        select: { candidateId: true, status: true },
      });
      if (!decision) return { kind: 'decision_not_found' };
      if (input.scope.type === 'decision') {
        return {
          kind: 'found',
          value: {
            projectId: project.id,
            candidateId: decision.candidateId,
            decisionStatus: decision.status,
            gateResult: null,
          },
        };
      }
      const gate = await transaction.gateEvaluation.findFirst({
        where: { id: input.scope.gateEvaluationId, decisionId: input.decisionId },
        select: { result: true },
      });
      return gate
        ? {
            kind: 'found',
            value: {
              projectId: project.id,
              candidateId: decision.candidateId,
              decisionStatus: decision.status,
              gateResult: gate.result,
            },
          }
        : { kind: 'gate_evaluation_not_found' };
    });
  }

  list(input: {
    organizationId: string;
    projectSlug: string;
    decisionId: string;
    query: ReadinessWaiverListQuery;
  }): Promise<ReadinessWaiverListResult> {
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
      const decision = await transaction.readinessDecision.findFirst({
        where: { id: input.decisionId, projectId: project.id },
        select: { id: true },
      });
      if (!decision) return { kind: 'decision_not_found' };
      const cursor = input.query.cursor
        ? await transaction.readinessWaiver.findFirst({
            where: { id: input.query.cursor, decisionId: input.decisionId },
            select: { id: true, createdAt: true },
          })
        : null;
      if (input.query.cursor && !cursor) return { kind: 'cursor_not_found' };
      const records = await transaction.readinessWaiver.findMany({
        where: {
          decisionId: input.decisionId,
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
        take: input.query.limit + 1,
        select: READINESS_WAIVER_SELECTION,
      });
      const hasMore = records.length > input.query.limit;
      const page = records.slice(0, input.query.limit);
      const now = new Date();
      return {
        kind: 'found',
        value: {
          items: page.map((waiver) => toReadinessWaiver(waiver, now)),
          nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }
}
