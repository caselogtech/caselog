import { Inject, Injectable } from '@nestjs/common';
import type { CandidatePolicyAssignmentResponse } from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  claimIdempotency,
  findIdempotency,
  storeIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/idempotency';
import { ReleasePolicyVersionState } from '../../../generated/prisma/client';
import { READINESS_EVALUATOR_VERSION } from '../../domain/policies/readiness-evaluator';
import {
  CANDIDATE_POLICY_ASSIGNMENT_SELECTION,
  toCandidatePolicyAssignmentResponse,
} from '../persistence/candidate-policy-assignment.persistence';

export type CandidatePolicyAssignmentResult =
  | { kind: 'found'; value: CandidatePolicyAssignmentResponse }
  | {
      kind:
        | 'project_not_found'
        | 'candidate_not_found'
        | 'policy_not_found'
        | 'published_version_not_found'
        | 'assignment_not_found'
        | 'idempotency_conflict';
    };

@Injectable()
export class CandidatePolicyAssignmentRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  assign(input: {
    organizationId: string;
    projectId: string;
    projectSlug: string;
    candidateId: string;
    policyId: string;
    actorId: string;
    idempotencyKey: string;
    requestHash: string;
    evidenceRevision: number;
  }): Promise<CandidatePolicyAssignmentResult> {
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

      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended('release-readiness:' || ${input.candidateId}::text, 0)
        )
      `;
      const scope = `candidate:${input.candidateId}:release-policy:assign`;
      const previous = await findIdempotency<CandidatePolicyAssignmentResponse>(
        transaction,
        input.organizationId,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (previous?.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (previous?.kind === 'replay') return { kind: 'found', value: previous.value };

      const policy = await transaction.releasePolicy.findFirst({
        where: { id: input.policyId, projectId: project.id },
        select: {
          id: true,
          versions: {
            where: { state: ReleasePolicyVersionState.PUBLISHED },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (!policy) return { kind: 'policy_not_found' };
      const policyVersionId = policy.versions[0]?.id;
      if (!policyVersionId) return { kind: 'published_version_not_found' };

      const claim = await claimIdempotency<CandidatePolicyAssignmentResponse>(
        transaction,
        input.organizationId,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (claim.kind === 'replay') return { kind: 'found', value: claim.value };

      const current = await transaction.currentCandidatePolicyAssignment.findUnique({
        where: {
          organizationId_candidateId: {
            organizationId: input.organizationId,
            candidateId: input.candidateId,
          },
        },
        select: {
          assignment: {
            select: {
              policyVersionId: true,
              ...CANDIDATE_POLICY_ASSIGNMENT_SELECTION,
            },
          },
        },
      });
      let record = current?.assignment;
      if (!record || record.policyVersionId !== policyVersionId) {
        record = await transaction.candidatePolicyAssignment.create({
          data: {
            organizationId: input.organizationId,
            projectId: project.id,
            candidateId: input.candidateId,
            policyId: policy.id,
            policyVersionId,
            assignedById: input.actorId,
          },
          select: {
            policyVersionId: true,
            ...CANDIDATE_POLICY_ASSIGNMENT_SELECTION,
          },
        });
        await transaction.currentCandidatePolicyAssignment.upsert({
          where: {
            organizationId_candidateId: {
              organizationId: input.organizationId,
              candidateId: input.candidateId,
            },
          },
          create: {
            organizationId: input.organizationId,
            projectId: project.id,
            candidateId: input.candidateId,
            assignmentId: record.id,
          },
          update: { assignmentId: record.id },
        });
        await transaction.currentReadinessDecision.upsert({
          where: {
            organizationId_candidateId: {
              organizationId: input.organizationId,
              candidateId: input.candidateId,
            },
          },
          create: {
            organizationId: input.organizationId,
            projectId: project.id,
            candidateId: input.candidateId,
            assignmentId: record.id,
            targetEvidenceRevision: input.evidenceRevision,
            targetEvaluatorVersion: READINESS_EVALUATOR_VERSION,
            state: 'PENDING',
          },
          update: {
            assignmentId: record.id,
            decisionId: null,
            targetEvidenceRevision: input.evidenceRevision,
            targetEvaluatorVersion: READINESS_EVALUATOR_VERSION,
            state: 'PENDING',
            failureCode: null,
          },
        });
        await appendAuditLog(transaction, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          actorType: 'user',
          action: 'release_policy.assigned',
          targetType: 'release_candidate',
          targetId: input.candidateId,
          metadata: {
            projectId: project.id,
            policyId: policy.id,
            policyVersionId,
            assignmentId: record.id,
          },
        });
      }
      const value = toCandidatePolicyAssignmentResponse(record);
      await storeIdempotencyResponse(
        transaction,
        input.organizationId,
        scope,
        input.idempotencyKey,
        value,
      );
      return { kind: 'found', value };
    });
  }

  current(
    organizationId: string,
    projectSlug: string,
    projectId: string,
    candidateId: string,
  ): Promise<CandidatePolicyAssignmentResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      if (project.id !== projectId) return { kind: 'candidate_not_found' };
      const record = await transaction.currentCandidatePolicyAssignment.findFirst({
        where: { projectId, candidateId },
        select: { assignment: { select: CANDIDATE_POLICY_ASSIGNMENT_SELECTION } },
      });
      return record
        ? { kind: 'found', value: toCandidatePolicyAssignmentResponse(record.assignment) }
        : { kind: 'assignment_not_found' };
    });
  }
}
