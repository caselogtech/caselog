import { Inject, Injectable } from '@nestjs/common';
import type { CandidateReadinessResponse } from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
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
  loadCurrentReadiness,
  loadReadinessAssignment,
} from '../persistence/readiness-decision-hydration.persistence';
import {
  READINESS_DECISION_SCALAR_SELECTION,
  READINESS_GATE_FOR_EVALUATION_SELECTION,
  type ReadinessEvaluationContext,
  toCandidateReadinessResponse,
  toDomainReadinessGates,
} from '../persistence/readiness-decision.persistence';

export type ReadinessEvaluationContextResult =
  | { kind: 'found'; value: ReadinessEvaluationContext }
  | { kind: 'project_not_found' | 'candidate_not_found' | 'assignment_not_found' };

export type ReadinessDecisionResult =
  | { kind: 'found'; value: CandidateReadinessResponse }
  | { kind: 'assignment_changed' | 'input_superseded' | 'projection_not_found' };

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
      const assignment = await loadReadinessAssignment(
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

  contextForCandidate(input: {
    organizationId: string;
    projectId: string;
    candidateId: string;
  }): Promise<ReadinessEvaluationContextResult> {
    return this.tenantDatabase.run(input.organizationId, async (transaction) => {
      const current = await transaction.currentCandidatePolicyAssignment.findFirst({
        where: { projectId: input.projectId, candidateId: input.candidateId },
        select: { assignmentId: true },
      });
      if (!current) return { kind: 'assignment_not_found' };
      const assignment = await loadReadinessAssignment(
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
          hashtextextended('release-readiness:' || ${input.candidateId}::text, 0)
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
      const requested = await transaction.currentReadinessDecision.findUnique({
        where: {
          organizationId_candidateId: {
            organizationId: input.organizationId,
            candidateId: input.candidateId,
          },
        },
        select: { assignmentId: true, targetEvidenceRevision: true, targetEvaluatorVersion: true },
      });
      if (
        requested?.assignmentId === input.assignmentId &&
        (requested.targetEvidenceRevision > input.evidenceRevision ||
          (requested.targetEvidenceRevision === input.evidenceRevision &&
            requested.targetEvaluatorVersion !== input.evaluatorVersion))
      ) {
        return { kind: 'input_superseded' };
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
          targetEvaluatorVersion: input.evaluatorVersion,
          state: ReadinessProjectionState.CURRENT,
        },
        update: {
          assignmentId: input.assignmentId,
          decisionId: decision.id,
          targetEvidenceRevision: input.evidenceRevision,
          targetEvaluatorVersion: input.evaluatorVersion,
          state: ReadinessProjectionState.CURRENT,
          failureCode: null,
        },
      });
      const current = await loadCurrentReadiness(
        transaction,
        input.organizationId,
        input.candidateId,
      );
      if (!current) return { kind: 'projection_not_found' };
      return {
        kind: 'found',
        value: toCandidateReadinessResponse(current, input.evidenceRevision),
      };
    });
  }
}
