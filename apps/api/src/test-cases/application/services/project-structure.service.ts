import { Inject, Injectable } from '@nestjs/common';
import {
  projectStructureResponseSchema,
  sectionResponseSchema,
  suiteResponseSchema,
  type CreateSectionRequest,
  type CreateSuiteRequest,
  type MoveSectionRequest,
  type MoveSuiteRequest,
  type OrganizationAccessPrincipal,
  type ProjectStructureResponse,
  type SectionResponse,
  type SuiteResponse,
  type UpdateSectionRequest,
  type UpdateSuiteRequest,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  InvalidPayloadError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import {
  ProjectStructureRepository,
  type StructureResult,
} from '../../infrastructure/repositories/project-structure.repository';

import {
  ProjectStructureCreateRepository,
  type StructureWriteIdentity,
} from '../../infrastructure/repositories/project-structure-create.repository';

@Injectable()
export class ProjectStructureService {
  constructor(
    @Inject(ProjectStructureRepository) private readonly structure: ProjectStructureRepository,
    @Inject(ProjectStructureCreateRepository)
    private readonly creation: ProjectStructureCreateRepository,
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
    idempotencyKey?: string,
  ): Promise<SuiteResponse> {
    this.assertWritable(principal);
    const result = await this.creation.createSuite(
      principal.organizationId,
      principal.sub,
      projectSlug,
      request,
      structureWriteIdentity(principal, idempotencyKey),
    );
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
    idempotencyKey?: string,
  ): Promise<SectionResponse> {
    this.assertWritable(principal);
    const result = await this.creation.createSection(
      principal.organizationId,
      principal.sub,
      projectSlug,
      suiteId,
      request,
      structureWriteIdentity(principal, idempotencyKey),
    );
    this.assertFound(result);
    return sectionResponseSchema.parse(result.value);
  }

  async moveSuite(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    suiteId: string,
    request: MoveSuiteRequest,
  ): Promise<SuiteResponse> {
    this.assertWritable(principal);
    const result = await this.structure.moveSuite(
      principal.organizationId,
      projectSlug,
      suiteId,
      request,
    );
    this.assertFound(result);
    return suiteResponseSchema.parse(result.value);
  }

  async moveSection(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    sectionId: string,
    request: MoveSectionRequest,
  ): Promise<SectionResponse> {
    this.assertWritable(principal);
    const result = await this.structure.moveSection(
      principal.organizationId,
      projectSlug,
      sectionId,
      request,
    );
    this.assertFound(result);
    return sectionResponseSchema.parse(result.value);
  }

  async deleteSuite(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    suiteId: string,
  ): Promise<void> {
    this.assertWritable(principal);
    const result = await this.structure.deleteSuite(principal.organizationId, projectSlug, suiteId);
    this.assertFound(result);
  }

  async deleteSection(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    sectionId: string,
  ): Promise<void> {
    this.assertWritable(principal);
    const result = await this.structure.deleteSection(
      principal.organizationId,
      projectSlug,
      sectionId,
    );
    this.assertFound(result);
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
    if (result.kind === 'idempotency_conflict') {
      throw new ResourceConflictError(
        'idempotency_key_reused',
        'The idempotency key was already used for another request',
      );
    }
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
    if (result.kind === 'not_empty') {
      throw new ResourceConflictError(
        `${result.resource}_not_empty`,
        `The ${result.resource} must be empty before it can be deleted`,
      );
    }
    if (result.kind === 'section_cycle') {
      throw new ResourceConflictError(
        'section_cycle',
        'A section cannot be moved inside its own subtree',
      );
    }
  }
}

function structureWriteIdentity(
  principal: OrganizationAccessPrincipal,
  idempotencyKey: string | undefined,
): StructureWriteIdentity {
  if (principal.tokenType === 'api_token' && !idempotencyKey) {
    throw new InvalidPayloadError(
      'idempotency_key_required',
      'Provide an Idempotency-Key for API token structure writes',
    );
  }
  return {
    idempotencyKey,
    apiTokenId: principal.tokenType === 'api_token' ? principal.apiTokenId : undefined,
  };
}
