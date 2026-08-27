import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateReadinessWaiverRequest,
  OrganizationAccessPrincipal,
  ReadinessWaiverListQuery,
  ReadinessWaiverListResponse,
  ReadinessWaiverResponse,
  RevokeReadinessWaiverRequest,
} from '@caselog/schemas';
import {
  readinessWaiverListResponseSchema,
  readinessWaiverResponseSchema,
} from '@caselog/schemas/readiness';
import {
  InvalidPayloadError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { validateReadinessWaiverTarget } from '../../domain/policies/readiness-waiver.policy';
import {
  ReadinessWaiverQueryRepository,
  type ReadinessWaiverTargetResult,
} from '../../infrastructure/repositories/readiness-waiver-query.repository';
import {
  ReadinessWaiverRepository,
  type ReadinessWaiverWriteResult,
} from '../../infrastructure/repositories/readiness-waiver.repository';

@Injectable()
export class ReadinessWaiverService {
  constructor(
    @Inject(ReadinessWaiverRepository)
    private readonly waivers: ReadinessWaiverRepository,
    @Inject(ReadinessWaiverQueryRepository)
    private readonly queries: ReadinessWaiverQueryRepository,
  ) {}

  async create(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    decisionId: string,
    idempotencyKey: string,
    request: CreateReadinessWaiverRequest,
  ): Promise<ReadinessWaiverResponse> {
    const target = this.resolveTarget(
      await this.queries.target({
        organizationId: principal.organizationId,
        projectSlug,
        decisionId,
        scope: request.scope,
      }),
    );
    const issue = validateReadinessWaiverTarget(target);
    if (issue === 'decision_already_ready') {
      throw new ResourceConflictError(
        'readiness_decision_already_ready',
        'A ready decision does not require a waiver',
      );
    }
    if (issue === 'gate_already_passed') {
      throw new ResourceConflictError(
        'readiness_gate_already_passed',
        'A passed gate does not require a waiver',
      );
    }
    return this.resolveWrite(
      await this.waivers.create({
        organizationId: principal.organizationId,
        projectSlug,
        decisionId,
        actorId: principal.sub,
        idempotencyKey,
        requestHash: hash(request),
        request,
      }),
    );
  }

  async list(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    decisionId: string,
    query: ReadinessWaiverListQuery,
  ): Promise<ReadinessWaiverListResponse> {
    const result = await this.queries.list({
      organizationId: principal.organizationId,
      projectSlug,
      decisionId,
      query,
    });
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'decision_not_found') {
      throw new ResourceNotFoundError('readiness_decision');
    }
    if (result.kind === 'cursor_not_found') {
      throw new ResourceNotFoundError('readiness_waiver_cursor');
    }
    if (result.kind !== 'found') {
      throw new Error(`Unhandled readiness waiver list result: ${result.kind}`);
    }
    return readinessWaiverListResponseSchema.parse(result.value);
  }

  async revoke(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    decisionId: string,
    waiverId: string,
    idempotencyKey: string,
    request: RevokeReadinessWaiverRequest,
  ): Promise<ReadinessWaiverResponse> {
    return this.resolveWrite(
      await this.waivers.revoke({
        organizationId: principal.organizationId,
        projectSlug,
        decisionId,
        waiverId,
        actorId: principal.sub,
        idempotencyKey,
        requestHash: hash(request),
        request,
      }),
    );
  }

  private resolveTarget(result: ReadinessWaiverTargetResult) {
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'decision_not_found') {
      throw new ResourceNotFoundError('readiness_decision');
    }
    if (result.kind === 'gate_evaluation_not_found') {
      throw new ResourceNotFoundError('gate_evaluation');
    }
    if (result.kind !== 'found') {
      throw new Error(`Unhandled readiness waiver target result: ${result.kind}`);
    }
    return result.value;
  }

  private resolveWrite(result: ReadinessWaiverWriteResult): ReadinessWaiverResponse {
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'decision_not_found') {
      throw new ResourceNotFoundError('readiness_decision');
    }
    if (result.kind === 'gate_evaluation_not_found') {
      throw new ResourceNotFoundError('gate_evaluation');
    }
    if (result.kind === 'waiver_not_found') {
      throw new ResourceNotFoundError('readiness_waiver');
    }
    if (result.kind === 'idempotency_conflict') {
      throw new ResourceConflictError(
        'idempotency_key_reused',
        'The idempotency key was already used for another request',
      );
    }
    if (result.kind === 'active_waiver_exists') {
      throw new ResourceConflictError(
        'active_readiness_waiver_exists',
        'This readiness target already has an active waiver',
      );
    }
    if (result.kind === 'waiver_expired') {
      throw new ResourceConflictError(
        'readiness_waiver_expired',
        'An expired readiness waiver cannot be revoked',
      );
    }
    if (result.kind === 'waiver_revoked') {
      throw new ResourceConflictError(
        'readiness_waiver_already_revoked',
        'The readiness waiver has already been revoked',
      );
    }
    if (result.kind === 'expiry_not_future') {
      throw new InvalidPayloadError(
        'readiness_waiver_expiry_not_future',
        'Waiver expiry must be in the future',
      );
    }
    if (result.kind !== 'found') {
      throw new Error(`Unhandled readiness waiver result: ${result.kind}`);
    }
    return readinessWaiverResponseSchema.parse(result.value);
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
