import { Inject, Injectable } from '@nestjs/common';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { ReadinessProjectionState } from '../../../generated/prisma/client';
import type { ReadinessEvaluationJob } from '../../domain/models/readiness-evaluation-job';
import { READINESS_EVALUATOR_VERSION } from '../../domain/policies/readiness-evaluator';

export type ReadinessEvaluationRequestResult =
  | { kind: 'requested'; job: ReadinessEvaluationJob }
  | { kind: 'already_current' | 'already_failed' | 'obsolete' | 'unassigned' };

@Injectable()
export class ReadinessEvaluationRequestRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  request(input: {
    organizationId: string;
    candidateId: string;
    evidenceRevision: number;
    trigger: ReadinessEvaluationJob['trigger'];
  }): Promise<ReadinessEvaluationRequestResult> {
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
        select: { projectId: true, assignmentId: true },
      });
      if (!currentAssignment) return { kind: 'unassigned' };

      const projection = await transaction.currentReadinessDecision.findUnique({
        where: {
          organizationId_candidateId: {
            organizationId: input.organizationId,
            candidateId: input.candidateId,
          },
        },
        select: {
          assignmentId: true,
          decisionId: true,
          targetEvidenceRevision: true,
          targetEvaluatorVersion: true,
          state: true,
          decision: {
            select: { assignmentId: true, evidenceRevision: true, evaluatorVersion: true },
          },
        },
      });
      const sameAssignment = projection?.assignmentId === currentAssignment.assignmentId;
      if (
        sameAssignment &&
        projection?.decision?.assignmentId === currentAssignment.assignmentId &&
        projection?.decision?.evidenceRevision === input.evidenceRevision &&
        projection.decision.evaluatorVersion === READINESS_EVALUATOR_VERSION
      ) {
        return { kind: 'already_current' };
      }
      if (
        sameAssignment &&
        projection &&
        projection.targetEvidenceRevision > input.evidenceRevision
      ) {
        return { kind: 'obsolete' };
      }
      if (
        input.trigger === 'RECONCILIATION' &&
        sameAssignment &&
        projection?.state === ReadinessProjectionState.FAILED &&
        projection.targetEvidenceRevision === input.evidenceRevision &&
        projection.targetEvaluatorVersion === READINESS_EVALUATOR_VERSION
      ) {
        return { kind: 'already_failed' };
      }

      const targetEvidenceRevision = Math.max(
        projection?.targetEvidenceRevision ?? 0,
        input.evidenceRevision,
      );
      const state =
        sameAssignment && projection?.decisionId
          ? ReadinessProjectionState.STALE
          : ReadinessProjectionState.PENDING;
      await transaction.currentReadinessDecision.upsert({
        where: {
          organizationId_candidateId: {
            organizationId: input.organizationId,
            candidateId: input.candidateId,
          },
        },
        create: {
          organizationId: input.organizationId,
          projectId: currentAssignment.projectId,
          candidateId: input.candidateId,
          assignmentId: currentAssignment.assignmentId,
          targetEvidenceRevision,
          targetEvaluatorVersion: READINESS_EVALUATOR_VERSION,
          state,
        },
        update: {
          assignmentId: currentAssignment.assignmentId,
          decisionId: sameAssignment ? projection?.decisionId : null,
          targetEvidenceRevision,
          targetEvaluatorVersion: READINESS_EVALUATOR_VERSION,
          state,
          failureCode: null,
        },
      });
      return {
        kind: 'requested',
        job: {
          organizationId: input.organizationId,
          candidateId: input.candidateId,
          assignmentId: currentAssignment.assignmentId,
          evidenceRevision: targetEvidenceRevision,
          evaluatorVersion: READINESS_EVALUATOR_VERSION,
          trigger: input.trigger,
        },
      };
    });
  }

  markFailed(job: ReadinessEvaluationJob, failureCode: string): Promise<boolean> {
    return this.tenantDatabase.run(job.organizationId, async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended('release-readiness:' || ${job.candidateId}::text, 0)
        )
      `;
      const projection = await transaction.currentReadinessDecision.findUnique({
        where: {
          organizationId_candidateId: {
            organizationId: job.organizationId,
            candidateId: job.candidateId,
          },
        },
        select: {
          assignmentId: true,
          targetEvidenceRevision: true,
          targetEvaluatorVersion: true,
          state: true,
          decision: { select: { evidenceRevision: true } },
        },
      });
      if (
        !projection ||
        projection.assignmentId !== job.assignmentId ||
        projection.targetEvidenceRevision !== job.evidenceRevision ||
        projection.targetEvaluatorVersion !== job.evaluatorVersion ||
        (projection.decision?.evidenceRevision ?? -1) >= job.evidenceRevision
      ) {
        return false;
      }
      if (
        projection.state === ReadinessProjectionState.FAILED &&
        failureCode === 'evaluation_retries_exhausted'
      ) {
        return false;
      }
      await transaction.currentReadinessDecision.update({
        where: {
          organizationId_candidateId: {
            organizationId: job.organizationId,
            candidateId: job.candidateId,
          },
        },
        data: { state: ReadinessProjectionState.FAILED, failureCode },
      });
      await appendAuditLog(transaction, {
        organizationId: job.organizationId,
        actorId: job.candidateId,
        actorType: 'system',
        action: 'readiness_evaluation.failed',
        targetType: 'release_candidate',
        targetId: job.candidateId,
        metadata: {
          assignmentId: job.assignmentId,
          evidenceRevision: job.evidenceRevision,
          evaluatorVersion: job.evaluatorVersion,
          failureCode,
        },
      });
      return true;
    });
  }
}
