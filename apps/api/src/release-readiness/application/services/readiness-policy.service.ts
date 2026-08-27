import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateReadinessPolicyRequest,
  CreateReadinessPolicyVersionRequest,
  OrganizationAccessPrincipal,
  ReadinessGateInput,
  ReadinessPolicyListQuery,
  ReadinessPolicyListResponse,
  ReadinessPolicyResponse,
} from '@caselog/schemas';
import {
  readinessPolicyListResponseSchema,
  readinessPolicyResponseSchema,
} from '@caselog/schemas/readiness';
import {
  InvalidPayloadError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { type ReadinessGate, validateReadinessGates } from '../../domain/models/readiness-policy';
import {
  ReadinessPolicyRepository,
  type ReadinessPolicyWriteResult,
} from '../../infrastructure/repositories/readiness-policy.repository';

@Injectable()
export class ReadinessPolicyService {
  constructor(
    @Inject(ReadinessPolicyRepository)
    private readonly policies: ReadinessPolicyRepository,
  ) {}

  async list(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    query: ReadinessPolicyListQuery,
  ): Promise<ReadinessPolicyListResponse> {
    const result = await this.policies.list(principal.organizationId, projectSlug, query);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'cursor_not_found') {
      throw new ResourceNotFoundError('release_policy_cursor');
    }
    if (result.kind !== 'found') {
      throw new Error(`Unhandled readiness policy list result: ${result.kind}`);
    }
    return readinessPolicyListResponseSchema.parse(result.value);
  }

  async create(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    idempotencyKey: string,
    request: CreateReadinessPolicyRequest,
  ): Promise<ReadinessPolicyResponse> {
    this.assertValidGates(request.gates);
    return this.resolveWrite(
      await this.policies.create(
        principal.organizationId,
        projectSlug,
        principal.sub,
        idempotencyKey,
        hash(request),
        request,
      ),
    );
  }

  async detail(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    policyId: string,
  ): Promise<ReadinessPolicyResponse> {
    const result = await this.policies.detail(principal.organizationId, projectSlug, policyId);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'policy_not_found') throw new ResourceNotFoundError('release_policy');
    if (result.kind !== 'found')
      throw new Error(`Unhandled readiness policy result: ${result.kind}`);
    return readinessPolicyResponseSchema.parse(result.value);
  }

  async createVersion(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    policyId: string,
    idempotencyKey: string,
    request: CreateReadinessPolicyVersionRequest,
  ): Promise<ReadinessPolicyResponse> {
    this.assertValidGates(request.gates);
    return this.resolveWrite(
      await this.policies.createVersion(
        principal.organizationId,
        projectSlug,
        policyId,
        principal.sub,
        idempotencyKey,
        hash(request),
        request,
      ),
    );
  }

  async publish(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    policyId: string,
    idempotencyKey: string,
  ): Promise<ReadinessPolicyResponse> {
    const detail = await this.detail(principal, projectSlug, policyId);
    const draft = detail.policy.versions.find(({ state }) => state === 'draft');
    if (draft) this.assertValidGates(draft.gates);
    return this.resolveWrite(
      await this.policies.publish(
        principal.organizationId,
        projectSlug,
        policyId,
        draft?.id ?? null,
        principal.sub,
        idempotencyKey,
        hash({ policyId }),
      ),
    );
  }

  private assertValidGates(gates: ReadinessGateInput[]): void {
    const issues = validateReadinessGates(gates.map(toDomainGate));
    if (issues.length > 0) {
      throw new InvalidPayloadError(
        'invalid_release_policy',
        'The release policy contains invalid gates',
        { issues },
      );
    }
  }

  private resolveWrite(result: ReadinessPolicyWriteResult): ReadinessPolicyResponse {
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'policy_not_found') throw new ResourceNotFoundError('release_policy');
    if (result.kind === 'policy_key_conflict') {
      throw new ResourceConflictError(
        'release_policy_key_taken',
        'A release policy with this key already exists',
      );
    }
    if (result.kind === 'idempotency_conflict') {
      throw new ResourceConflictError(
        'idempotency_key_reused',
        'The idempotency key was already used for another request',
      );
    }
    if (result.kind === 'draft_exists') {
      throw new ResourceConflictError(
        'release_policy_draft_exists',
        'Publish or replace the existing draft before creating another version',
      );
    }
    if (result.kind === 'draft_not_found' || result.kind === 'draft_changed') {
      throw new ResourceConflictError(
        'release_policy_draft_changed',
        'The release policy draft changed before it could be published',
      );
    }
    if (result.kind !== 'found')
      throw new Error(`Unhandled readiness policy result: ${result.kind}`);
    return readinessPolicyResponseSchema.parse(result.value);
  }
}

function toDomainGate(gate: ReadinessGateInput, position: number): ReadinessGate {
  return {
    id: gate.key,
    key: gate.key,
    position,
    metricKey: gate.metricKey,
    metricVersion: gate.metricVersion,
    dimensions: gate.dimensions,
    operator: gate.operator.toUpperCase() as ReadinessGate['operator'],
    expected: gate.expected,
    impact: gate.impact.toUpperCase() as ReadinessGate['impact'],
    missingEvidenceBehavior:
      gate.missingEvidenceBehavior.toUpperCase() as ReadinessGate['missingEvidenceBehavior'],
    staleEvidenceBehavior:
      gate.staleEvidenceBehavior.toUpperCase() as ReadinessGate['staleEvidenceBehavior'],
    minimumTrust: gate.minimumTrust.toUpperCase() as ReadinessGate['minimumTrust'],
  };
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
