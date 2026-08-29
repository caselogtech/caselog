import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  createEnvironmentResponseSchema,
  environmentLifecycleResponseSchema,
  environmentListResponseSchema,
  updateEnvironmentResponseSchema,
  type CreateEnvironmentRequest,
  type CreateEnvironmentResponse,
  type EnvironmentLifecycleResponse,
  type EnvironmentListResponse,
  type OrganizationAccessPrincipal,
  type UpdateEnvironmentRequest,
  type UpdateEnvironmentResponse,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { EnvironmentRepository } from '../../infrastructure/repositories/environment.repository';

@Injectable()
export class EnvironmentService {
  constructor(
    @Inject(EnvironmentRepository) private readonly environments: EnvironmentRepository,
  ) {}

  async list(organizationId: string, projectSlug: string): Promise<EnvironmentListResponse> {
    const result = await this.environments.list(organizationId, projectSlug);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    return environmentListResponseSchema.parse({ items: result.value });
  }

  async create(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    idempotencyKey: string,
    request: CreateEnvironmentRequest,
  ): Promise<CreateEnvironmentResponse> {
    this.assertManage(principal);
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const result = await this.environments.create(
      principal.organizationId,
      projectSlug,
      principal.sub,
      idempotencyKey,
      requestHash,
      request,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'slug_conflict') {
      throw new ResourceConflictError(
        'environment_slug_taken',
        'This environment URL is already in use in the project',
      );
    }
    if (result.kind === 'idempotency_conflict') throw this.idempotencyConflict();
    return createEnvironmentResponseSchema.parse({ environment: result.value });
  }

  async update(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    environmentId: string,
    request: UpdateEnvironmentRequest,
  ): Promise<UpdateEnvironmentResponse> {
    this.assertManage(principal);
    const result = await this.environments.update(
      principal.organizationId,
      projectSlug,
      environmentId,
      principal.sub,
      request,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'environment_not_found') throw new ResourceNotFoundError('environment');
    if (result.kind === 'slug_conflict') {
      throw new ResourceConflictError(
        'environment_slug_taken',
        'This environment URL is already in use in the project',
      );
    }
    return updateEnvironmentResponseSchema.parse({ environment: result.value });
  }

  async archive(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    environmentId: string,
  ): Promise<EnvironmentLifecycleResponse> {
    this.assertManage(principal);
    return this.resolveLifecycle(
      await this.environments.archive(
        principal.organizationId,
        projectSlug,
        environmentId,
        principal.sub,
      ),
    );
  }

  async restore(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    environmentId: string,
  ): Promise<EnvironmentLifecycleResponse> {
    this.assertManage(principal);
    return this.resolveLifecycle(
      await this.environments.restore(
        principal.organizationId,
        projectSlug,
        environmentId,
        principal.sub,
      ),
    );
  }

  private resolveLifecycle(
    result: Awaited<ReturnType<EnvironmentRepository['archive']>>,
  ): EnvironmentLifecycleResponse {
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'environment_not_found') throw new ResourceNotFoundError('environment');
    if (result.kind === 'open_releases') {
      throw new ResourceConflictError(
        'environment_has_open_releases',
        'Release or cancel open releases before archiving this environment',
      );
    }
    return environmentLifecycleResponseSchema.parse(result.value);
  }

  private assertManage(principal: OrganizationAccessPrincipal): void {
    if (
      principal.tokenType !== 'organization' ||
      !['owner', 'admin', 'lead'].includes(principal.role)
    ) {
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
