import { Inject, Injectable } from '@nestjs/common';
import {
  projectStructureResponseSchema,
  sectionResponseSchema,
  suiteResponseSchema,
  type CreateSectionRequest,
  type CreateSuiteRequest,
  type OrganizationAccessPrincipal,
  type ProjectStructureResponse,
  type SectionResponse,
  type SuiteResponse,
  type UpdateSectionRequest,
  type UpdateSuiteRequest,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../common/errors/domain.error';
import { ProjectStructureRepository, type StructureResult } from './project-structure.repository';

@Injectable()
export class ProjectStructureService {
  constructor(
    @Inject(ProjectStructureRepository) private readonly structure: ProjectStructureRepository,
  ) {}

  async get(organizationId: string, projectSlug: string): Promise<ProjectStructureResponse> {
    const result = await this.structure.get(organizationId, projectSlug);
    this.assertFound(result);
    return projectStructureResponseSchema.parse(result.value);
  }

  async createSuite(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    request: CreateSuiteRequest,
  ): Promise<SuiteResponse> {
    this.assertWritable(principal);
    const result = await this.structure.createSuite(principal.organizationId, projectSlug, request);
    this.assertFound(result);
    return suiteResponseSchema.parse(result.value);
  }

  async updateSuite(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    suiteId: string,
    request: UpdateSuiteRequest,
  ): Promise<SuiteResponse> {
    this.assertWritable(principal);
    const result = await this.structure.updateSuite(
      principal.organizationId,
      projectSlug,
      suiteId,
      request,
    );
    this.assertFound(result);
    return suiteResponseSchema.parse(result.value);
  }

  async createSection(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    suiteId: string,
    request: CreateSectionRequest,
  ): Promise<SectionResponse> {
    this.assertWritable(principal);
    const result = await this.structure.createSection(
      principal.organizationId,
      projectSlug,
      suiteId,
      request,
    );
    this.assertFound(result);
    return sectionResponseSchema.parse(result.value);
  }

  async updateSection(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    sectionId: string,
    request: UpdateSectionRequest,
  ): Promise<SectionResponse> {
    this.assertWritable(principal);
    const result = await this.structure.updateSection(
      principal.organizationId,
      projectSlug,
      sectionId,
      request,
    );
    this.assertFound(result);
    return sectionResponseSchema.parse(result.value);
  }

  private assertWritable(principal: OrganizationAccessPrincipal): void {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
  }

  private assertFound<T>(
    result: StructureResult<T>,
  ): asserts result is { kind: 'found'; value: T } {
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'suite_not_found') throw new ResourceNotFoundError('suite');
    if (result.kind === 'section_not_found') throw new ResourceNotFoundError('section');
    if (result.kind === 'parent_not_found') throw new ResourceNotFoundError('parent_section');
    if (result.kind === 'name_taken') {
      throw new ResourceConflictError(
        `${result.resource}_name_taken`,
        `A ${result.resource} with this name already exists`,
      );
    }
  }
}
