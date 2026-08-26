import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  createReleaseResponseSchema,
  releaseDetailResponseSchema,
  releaseLifecycleResponseSchema,
  releaseListResponseSchema,
  type CreateReleaseRequest,
  type CreateReleaseResponse,
  type OrganizationAccessPrincipal,
  type ReleaseDetailResponse,
  type ReleaseLifecycleResponse,
  type ReleaseListQuery,
  type ReleaseListResponse,
  type ReleaseState,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { ReleaseRepository } from '../../infrastructure/repositories/release.repository';

@Injectable()
export class ReleaseService {
  constructor(@Inject(ReleaseRepository) private readonly releases: ReleaseRepository) {}

  async list(
    organizationId: string,
    projectSlug: string,
    query: ReleaseListQuery,
  ): Promise<ReleaseListResponse> {
    const result = await this.releases.list(organizationId, projectSlug, query);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    return releaseListResponseSchema.parse(result.value);
  }

  async create(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    idempotencyKey: string,
    request: CreateReleaseRequest,
  ): Promise<CreateReleaseResponse> {
    this.assertManage(principal);
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const result = await this.releases.create(
      principal.organizationId,
      projectSlug,
      principal.sub,
      idempotencyKey,
      requestHash,
      request,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'environment_not_found') throw new ResourceNotFoundError('environment');
    if (result.kind === 'environment_archived') {
      throw new ResourceConflictError(
        'environment_archived',
        'An archived environment cannot receive a new release',
      );
    }
    if (result.kind === 'key_conflict') {
      throw new ResourceConflictError(
        'release_key_taken',
        'This release key is already in use in the project',
      );
    }
    if (result.kind === 'idempotency_conflict') throw this.idempotencyConflict();
    return createReleaseResponseSchema.parse({ release: result.value });
  }

  async detail(
    organizationId: string,
    projectSlug: string,
    releaseId: string,
  ): Promise<ReleaseDetailResponse> {
    const result = await this.releases.detail(organizationId, projectSlug, releaseId);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'release_not_found') throw new ResourceNotFoundError('release');
    return releaseDetailResponseSchema.parse(result.value);
  }

  async transition(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    releaseId: string,
    target: Exclude<ReleaseState, 'draft'>,
  ): Promise<ReleaseLifecycleResponse> {
    this.assertManage(principal);
    const result = await this.releases.transition(
      principal.organizationId,
      projectSlug,
      releaseId,
      principal.sub,
      target,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'release_not_found') throw new ResourceNotFoundError('release');
    if (result.kind === 'invalid_transition') {
      throw new ResourceConflictError(
        'invalid_release_transition',
        `A release cannot move from ${result.from} to ${result.to}`,
        { from: result.from, to: result.to },
      );
    }
    return releaseLifecycleResponseSchema.parse(result.value);
  }

  private assertManage(principal: OrganizationAccessPrincipal): void {
    if (!['owner', 'admin', 'lead'].includes(principal.role)) {
      throw new AuthorizationDeniedError();
    }
  }

  private idempotencyConflict(): ResourceConflictError {
    return new ResourceConflictError(
      'idempotency_conflict',
      'This idempotency key was already used for a different request',
    );
  }
}
