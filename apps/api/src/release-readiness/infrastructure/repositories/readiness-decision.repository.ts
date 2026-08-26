import { Inject, Injectable } from '@nestjs/common';
import type {
  CandidatePolicyAssignment,
  CandidateReadinessResponse,
  ReadinessDecisionListQuery,
  ReadinessDecisionListResponse,
  ReadinessDecisionResponse,
} from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../../../core/database/application/services/tenant-database.service';
import {
  EvidenceValueType,
  GateEvaluationDiagnostic,
  GateEvaluationResult,
  ReadinessDecisionStatus,
  ReadinessEvaluationTrigger,
  ReadinessProjectionState,
} from '../../../generated/prisma/client';
import type { ReadinessGate } from '../../domain/models/readiness-policy';
import type { ReadinessEvaluation } from '../../domain/policies/readiness-evaluator';
import {
  GATE_EVALUATION_SCALAR_SELECTION,
  type HydratedReadinessDecisionRecord,
  READINESS_DECISION_SCALAR_SELECTION,
  READINESS_GATE_FOR_EVALUATION_SELECTION,
  type ReadinessDecisionScalarRecord,
  type ReadinessEvaluationContext,
  toCandidateReadinessResponse,
  toDomainReadinessGates,
  toReadinessDecision,
} from '../persistence/readiness-decision.persistence';

export type ReadinessEvaluationContextResult =
  | { kind: 'found'; value: ReadinessEvaluationContext }
  | { kind: 'project_not_found' | 'candidate_not_found' | 'assignment_not_found' };

export type ReadinessDecisionResult =
  | { kind: 'found'; value: CandidateReadinessResponse }
  | { kind: 'assignment_changed' | 'projection_not_found' };

export type ReadinessDecisionHistoryResult =
  | { kind: 'found'; value: ReadinessDecisionListResponse }
  | { kind: 'project_not_found' | 'candidate_not_found' | 'cursor_not_found' };

export type ReadinessDecisionDetailResult =
  | { kind: 'found'; value: ReadinessDecisionResponse }
  | { kind: 'project_not_found' | 'decision_not_found' };

@Injectable()
export class ReadinessDecisionRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  context(input: {
    organizationId: string;
    projectId: string;
    projectSlug: string;
    candidateId: string;
  }): Promise<ReadinessEvaluationContextResult> {
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
      const current = await transaction.currentCandidatePolicyAssignment.findFirst({
        where: { projectId: project.id, candidateId: input.candidateId },
        select: { assignmentId: true },
      });
      if (!current) return { kind: 'assignment_not_found' };
      const assignment = await loadAssignment(
        transaction,
        input.organizationId,
        current.assignmentId,
      );
      if (!assignment) return { kind: 'assignment_not_found' };
      const gates = await transaction.readinessGate.findMany({
        where: { policyVersionId: assignment.policyVersion.id },
        orderBy: { position: 'asc' },
        select: READINESS_GATE_FOR_EVALUATION_SELECTION,
      });
      return {
        kind: 'found',
        value: { assignment, gates: toDomainReadinessGates(gates) },
      };
    });
  }

  record(input: {
    organizationId: string;
    projectId: string;
    candidateId: string;
    assignmentId: string;
    policyVersionId: string;
    evidenceRevision: number;
    evaluatorVersion: string;
    evaluatedAt: Date;
    evaluatedById: string | null;
    trigger: 'MANUAL' | 'EVIDENCE_CHANGED' | 'POLICY_ASSIGNED' | 'RECONCILIATION';
    evaluation: ReadinessEvaluation;
    gates: ReadinessGate[];
  }): Promise<ReadinessDecisionResult> {
    return this.tenantDatabase.run(input.organizationId, async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended('readiness-evaluation:' || ${input.candidateId}::text, 0)
        )
      `;
      const currentAssignment = await transaction.currentCandidatePolicyAssignment.findUnique({
        where: {
          organizationId_candidateId: {
            organizationId: input.organizationId,
            candidateId: input.candidateId,
          },
        },
        select: { assignmentId: true },
      });
      if (currentAssignment?.assignmentId !== input.assignmentId) {
        return { kind: 'assignment_changed' };
      }

      let decision = await transaction.readinessDecision.findUnique({
        where: {
          organizationId_candidateId_policyVersionId_evidenceRevision_evaluatorVersion: {
            organizationId: input.organizationId,
            candidateId: input.candidateId,
            policyVersionId: input.policyVersionId,
            evidenceRevision: input.evidenceRevision,
            evaluatorVersion: input.evaluatorVersion,
          },
        },
        select: READINESS_DECISION_SCALAR_SELECTION,
      });
      if (!decision) {
        decision = await transaction.readinessDecision.create({
          data: {
            organizationId: input.organizationId,
            projectId: input.projectId,
            candidateId: input.candidateId,
            assignmentId: input.assignmentId,
            policyVersionId: input.policyVersionId,
            evidenceRevision: input.evidenceRevision,
            evaluatorVersion: input.evaluatorVersion,
            trigger: ReadinessEvaluationTrigger[input.trigger],
            status: ReadinessDecisionStatus[input.evaluation.status],
            evaluatedById: input.evaluatedById,
            evaluatedAt: input.evaluatedAt,
          },
          select: READINESS_DECISION_SCALAR_SELECTION,
        });
        const decisionId = decision.id;
        const gateById = new Map(input.gates.map((gate) => [gate.id, gate]));
        await transaction.gateEvaluation.createMany({
          data: input.evaluation.gates.map((evaluation) => {
            const gate = gateById.get(evaluation.gateId);
            if (!gate) throw new Error(`Readiness gate ${evaluation.gateId} disappeared`);
            return {
              organizationId: input.organizationId,
              projectId: input.projectId,
              candidateId: input.candidateId,
              decisionId,
              policyVersionId: input.policyVersionId,
              gateId: gate.id,
              position: evaluation.position,
              result: GateEvaluationResult[evaluation.result],
              diagnostic: GateEvaluationDiagnostic[evaluation.diagnostic],
              metricKey: gate.metricKey,
              metricVersion: gate.metricVersion,
              dimensions: gate.dimensions,
              operator: gate.operator,
              expectedValueType:
                evaluation.expected.type === 'percentage'
                  ? EvidenceValueType.PERCENTAGE
                  : EvidenceValueType.INTEGER,
              expectedPercentage:
                evaluation.expected.type === 'percentage' ? evaluation.expected.value : null,
              expectedInteger:
                evaluation.expected.type === 'integer' ? evaluation.expected.value : null,
              actualPercentage:
                evaluation.actual?.type === 'percentage' ? evaluation.actual.value : null,
              actualInteger: evaluation.actual?.type === 'integer' ? evaluation.actual.value : null,
              selectedObservationId: evaluation.selectedObservationId,
              explanationCode: evaluation.explanationCode,
              evaluatorVersion: input.evaluatorVersion,
              evaluatedAt: input.evaluatedAt,
            };
          }),
        });
        await appendAuditLog(transaction, {
          organizationId: input.organizationId,
          actorId: input.evaluatedById ?? input.candidateId,
          actorType: input.evaluatedById ? 'user' : 'system',
          action: 'readiness_decision.recorded',
          targetType: 'release_candidate',
          targetId: input.candidateId,
          metadata: {
            projectId: input.projectId,
            decisionId: decision.id,
            assignmentId: input.assignmentId,
            policyVersionId: input.policyVersionId,
            evidenceRevision: input.evidenceRevision,
            evaluatorVersion: input.evaluatorVersion,
            trigger: input.trigger.toLowerCase(),
            status: input.evaluation.status.toLowerCase(),
          },
        });
      }

      await transaction.currentReadinessDecision.upsert({
        where: {
          organizationId_candidateId: {
            organizationId: input.organizationId,
            candidateId: input.candidateId,
          },
        },
        create: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          candidateId: input.candidateId,
          assignmentId: input.assignmentId,
          decisionId: decision.id,
          targetEvidenceRevision: input.evidenceRevision,
          state: ReadinessProjectionState.CURRENT,
        },
        update: {
          assignmentId: input.assignmentId,
          decisionId: decision.id,
          targetEvidenceRevision: input.evidenceRevision,
          state: ReadinessProjectionState.CURRENT,
          failureCode: null,
        },
      });
      const current = await loadCurrent(transaction, input.organizationId, input.candidateId);
      if (!current) return { kind: 'projection_not_found' };
      return {
        kind: 'found',
        value: toCandidateReadinessResponse(current, input.evidenceRevision),
      };
    });
  }

  current(
    organizationId: string,
    candidateId: string,
    currentEvidenceRevision: number,
  ): Promise<ReadinessDecisionResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const current = await loadCurrent(transaction, organizationId, candidateId);
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
      const hydrated = await hydrateDecisions(transaction, page);
      return {
        kind: 'found',
        value: {
          items: hydrated.map(toReadinessDecision),
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
      const [hydrated] = await hydrateDecisions(transaction, [record]);
      return hydrated
        ? { kind: 'found', value: { decision: toReadinessDecision(hydrated) } }
        : { kind: 'decision_not_found' };
    });
  }
}

async function loadAssignment(
  transaction: TenantTransaction,
  organizationId: string,
  assignmentId: string,
): Promise<CandidatePolicyAssignment | null> {
  const assignment = await transaction.candidatePolicyAssignment.findUnique({
    where: { organizationId_id: { organizationId, id: assignmentId } },
    select: {
      id: true,
      candidateId: true,
      policyId: true,
      policyVersionId: true,
      assignedAt: true,
    },
  });
  if (!assignment) return null;
  const policy = await transaction.releasePolicy.findUnique({
    where: { organizationId_id: { organizationId, id: assignment.policyId } },
    select: { id: true, key: true, name: true },
  });
  const version = await transaction.releasePolicyVersion.findUnique({
    where: { organizationId_id: { organizationId, id: assignment.policyVersionId } },
    select: { id: true, version: true },
  });
  if (!policy || !version) return null;
  return {
    id: assignment.id,
    candidateId: assignment.candidateId,
    policy,
    policyVersion: version,
    assignedAt: assignment.assignedAt.toISOString(),
  };
}

async function hydrateDecisions(
  transaction: TenantTransaction,
  decisions: ReadinessDecisionScalarRecord[],
): Promise<HydratedReadinessDecisionRecord[]> {
  if (decisions.length === 0) return [];
  const policyVersionIds = [...new Set(decisions.map(({ policyVersionId }) => policyVersionId))];
  const versions = await transaction.releasePolicyVersion.findMany({
    where: { id: { in: policyVersionIds } },
    select: { id: true, version: true },
  });
  const evaluations = await transaction.gateEvaluation.findMany({
    where: { decisionId: { in: decisions.map(({ id }) => id) } },
    orderBy: [{ decisionId: 'asc' }, { position: 'asc' }],
    select: GATE_EVALUATION_SCALAR_SELECTION,
  });
  const gates = await transaction.readinessGate.findMany({
    where: { id: { in: [...new Set(evaluations.map(({ gateId }) => gateId))] } },
    select: { id: true, key: true },
  });
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const gateKeyById = new Map(gates.map((gate) => [gate.id, gate.key]));
  return decisions.map((decision) => {
    const policyVersion = versionById.get(decision.policyVersionId);
    if (!policyVersion) throw new Error(`Policy version ${decision.policyVersionId} disappeared`);
    return {
      ...decision,
      policyVersion,
      gateEvaluations: evaluations
        .filter(({ decisionId }) => decisionId === decision.id)
        .map((evaluation) => {
          const gateKey = gateKeyById.get(evaluation.gateId);
          if (!gateKey) throw new Error(`Readiness gate ${evaluation.gateId} disappeared`);
          return { ...evaluation, gateKey };
        }),
    };
  });
}

async function loadCurrent(
  transaction: TenantTransaction,
  organizationId: string,
  candidateId: string,
) {
  const projection = await transaction.currentReadinessDecision.findUnique({
    where: { organizationId_candidateId: { organizationId, candidateId } },
    select: {
      assignmentId: true,
      decisionId: true,
      targetEvidenceRevision: true,
      state: true,
      failureCode: true,
    },
  });
  if (!projection) return null;
  const assignment = await loadAssignment(transaction, organizationId, projection.assignmentId);
  if (!assignment) return null;
  const decisionRecord = projection.decisionId
    ? await transaction.readinessDecision.findUnique({
        where: { organizationId_id: { organizationId, id: projection.decisionId } },
        select: READINESS_DECISION_SCALAR_SELECTION,
      })
    : null;
  const [decision] = decisionRecord ? await hydrateDecisions(transaction, [decisionRecord]) : [];
  return {
    targetEvidenceRevision: projection.targetEvidenceRevision,
    state: projection.state,
    failureCode: projection.failureCode,
    assignment,
    decision: decision ?? null,
  };
}
