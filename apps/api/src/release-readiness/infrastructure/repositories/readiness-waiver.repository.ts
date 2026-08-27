import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateReadinessWaiverRequest,
  ReadinessWaiverResponse,
  RevokeReadinessWaiverRequest,
} from '@caselog/schemas';
import { appendAuditLog } from '../../../audit/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  claimIdempotency,
  findIdempotency,
  storeIdempotencyResponse,
} from '../../../core/database/infrastructure/persistence/idempotency';
import { ReadinessWaiverScope } from '../../../generated/prisma/client';
import {
  loadReadinessWaiverDecisionContext,
  loadReadinessWaiverResponse,
  lockReadinessWaiver,
  lockReadinessWaiverTarget,
} from '../persistence/readiness-waiver-command.persistence';

export type ReadinessWaiverWriteResult =
  | { kind: 'found'; value: ReadinessWaiverResponse }
  | {
      kind:
        | 'project_not_found'
        | 'decision_not_found'
        | 'gate_evaluation_not_found'
        | 'waiver_not_found'
        | 'active_waiver_exists'
        | 'waiver_expired'
        | 'waiver_revoked'
        | 'expiry_not_future'
        | 'idempotency_conflict';
    };

@Injectable()
export class ReadinessWaiverRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  create(input: {
    organizationId: string;
    projectSlug: string;
    decisionId: string;
    actorId: string;
    idempotencyKey: string;
    requestHash: string;
    request: CreateReadinessWaiverRequest;
  }): Promise<ReadinessWaiverWriteResult> {
    return this.tenantDatabase.run(input.organizationId, async (transaction) => {
      const context = await loadReadinessWaiverDecisionContext(
        transaction,
        input.organizationId,
        input.projectSlug,
        input.decisionId,
      );
      if (context.kind !== 'found') return context;
      const gateEvaluationId =
        input.request.scope.type === 'gate_evaluation'
          ? input.request.scope.gateEvaluationId
          : null;
      await lockReadinessWaiverTarget(
        transaction,
        input.organizationId,
        input.decisionId,
        gateEvaluationId,
      );
      const scope = `readiness-decision:${input.decisionId}:waivers:create`;
      const previous = await findIdempotency<ReadinessWaiverResponse>(
        transaction,
        input.organizationId,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (previous?.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (previous?.kind === 'replay') return { kind: 'found', value: previous.value };

      const now = new Date();
      const expiresAt = input.request.expiresAt ? new Date(input.request.expiresAt) : null;
      if (expiresAt && expiresAt <= now) return { kind: 'expiry_not_future' };
      if (gateEvaluationId) {
        const gate = await transaction.gateEvaluation.findFirst({
          where: { id: gateEvaluationId, decisionId: input.decisionId },
          select: { id: true },
        });
        if (!gate) return { kind: 'gate_evaluation_not_found' };
      }

      const databaseScope = gateEvaluationId
        ? ReadinessWaiverScope.GATE_EVALUATION
        : ReadinessWaiverScope.DECISION;
      const active = await transaction.readinessWaiver.findFirst({
        where: {
          decisionId: input.decisionId,
          scope: databaseScope,
          gateEvaluationId,
          revocation: { is: null },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true },
      });
      if (active) return { kind: 'active_waiver_exists' };
      const claim = await claimIdempotency<ReadinessWaiverResponse>(
        transaction,
        input.organizationId,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (claim.kind === 'replay') return { kind: 'found', value: claim.value };

      const waiver = await transaction.readinessWaiver.create({
        data: {
          organizationId: input.organizationId,
          projectId: context.projectId,
          candidateId: context.candidateId,
          decisionId: input.decisionId,
          scope: databaseScope,
          gateEvaluationId,
          reason: input.request.reason,
          externalApprovalReference: input.request.externalApprovalReference,
          expiresAt,
          createdById: input.actorId,
          createdAt: now,
        },
        select: { id: true },
      });
      await appendAuditLog(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorType: 'user',
        action: 'readiness_waiver.created',
        targetType: 'readiness_waiver',
        targetId: waiver.id,
        metadata: {
          projectId: context.projectId,
          candidateId: context.candidateId,
          decisionId: input.decisionId,
          scope: input.request.scope.type,
          gateEvaluationId,
          expiresAt: input.request.expiresAt,
          externalApprovalReference: input.request.externalApprovalReference,
        },
      });
      const value = await loadReadinessWaiverResponse(
        transaction,
        input.organizationId,
        input.decisionId,
        waiver.id,
        now,
      );
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

  revoke(input: {
    organizationId: string;
    projectSlug: string;
    decisionId: string;
    waiverId: string;
    actorId: string;
    idempotencyKey: string;
    requestHash: string;
    request: RevokeReadinessWaiverRequest;
  }): Promise<ReadinessWaiverWriteResult> {
    return this.tenantDatabase.run(input.organizationId, async (transaction) => {
      const context = await loadReadinessWaiverDecisionContext(
        transaction,
        input.organizationId,
        input.projectSlug,
        input.decisionId,
      );
      if (context.kind !== 'found') return context;
      await lockReadinessWaiver(transaction, input.organizationId, input.waiverId);
      const scope = `readiness-waiver:${input.waiverId}:revoke`;
      const previous = await findIdempotency<ReadinessWaiverResponse>(
        transaction,
        input.organizationId,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (previous?.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (previous?.kind === 'replay') return { kind: 'found', value: previous.value };

      const waiver = await transaction.readinessWaiver.findFirst({
        where: { id: input.waiverId, decisionId: input.decisionId },
        select: { expiresAt: true, revocation: { select: { id: true } } },
      });
      if (!waiver) return { kind: 'waiver_not_found' };
      const now = new Date();
      if (waiver.revocation) return { kind: 'waiver_revoked' };
      if (waiver.expiresAt && waiver.expiresAt <= now) return { kind: 'waiver_expired' };
      const claim = await claimIdempotency<ReadinessWaiverResponse>(
        transaction,
        input.organizationId,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (claim.kind === 'replay') return { kind: 'found', value: claim.value };

      const revocation = await transaction.readinessWaiverRevocation.create({
        data: {
          organizationId: input.organizationId,
          projectId: context.projectId,
          candidateId: context.candidateId,
          decisionId: input.decisionId,
          waiverId: input.waiverId,
          reason: input.request.reason,
          revokedById: input.actorId,
          revokedAt: now,
        },
        select: { id: true },
      });
      await appendAuditLog(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        actorType: 'user',
        action: 'readiness_waiver.revoked',
        targetType: 'readiness_waiver',
        targetId: input.waiverId,
        metadata: {
          projectId: context.projectId,
          candidateId: context.candidateId,
          decisionId: input.decisionId,
          revocationId: revocation.id,
          reason: input.request.reason,
        },
      });
      const value = await loadReadinessWaiverResponse(
        transaction,
        input.organizationId,
        input.decisionId,
        input.waiverId,
        now,
      );
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
}
