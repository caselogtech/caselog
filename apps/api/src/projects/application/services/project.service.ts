import { Inject, Injectable } from '@nestjs/common';
import {
  createProjectResponseSchema,
  projectLifecycleResponseSchema,
  projectListResponseSchema,
  type CreateProjectRequest,
  type CreateProjectResponse,
  type OrganizationAccessPrincipal,
  type ProjectLifecycleResponse,
  type ProjectListQuery,
  type ProjectListResponse,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { ProjectRepository } from '../../infrastructure/repositories/project.repository';

@Injectable()
export class ProjectService {
  constructor(@Inject(ProjectRepository) private readonly projects: ProjectRepository) {}

  async list(organizationId: string, query: ProjectListQuery): Promise<ProjectListResponse> {
    return projectListResponseSchema.parse(
      await this.projects.list(organizationId, query.cursor, query.limit, query.state),
    );
  }

  async create(
    principal: OrganizationAccessPrincipal,
    request: CreateProjectRequest,
  ): Promise<CreateProjectResponse> {
    this.assertManage(principal);
    const result = await this.projects.create(principal.organizationId, request);
    if (result.kind === 'key_conflict') {
      throw new ResourceConflictError(
        'project_key_taken',
        'This project key is already in use in the workspace',
      );
    }
    if (result.kind === 'slug_conflict') {
      throw new ResourceConflictError(
        'project_slug_taken',
        'This project URL is already in use in the workspace',
      );
    }
    return createProjectResponseSchema.parse({ project: result.value });
  }

  async archive(principal: OrganizationAccessPrincipal, projectSlug: string): Promise<void> {
    this.assertManage(principal);
    const result = await this.projects.archive(
      principal.organizationId,
      projectSlug,
      principal.sub,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'open_runs') {
      throw new ResourceConflictError(
        'project_has_open_runs',
        'Close active and draft test runs before archiving this project',
      );
    }
  }

  async restore(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
  ): Promise<ProjectLifecycleResponse> {
    this.assertManage(principal);
    const result = await this.projects.restore(
      principal.organizationId,
      projectSlug,
      principal.sub,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    return projectLifecycleResponseSchema.parse(result.value);
  }

  private assertManage(principal: OrganizationAccessPrincipal): void {
    if (!['owner', 'admin', 'lead'].includes(principal.role)) {
      throw new AuthorizationDeniedError();
    }
  }
}
