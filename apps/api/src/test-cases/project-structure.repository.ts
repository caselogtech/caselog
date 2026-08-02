import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateSectionRequest,
  CreateSuiteRequest,
  ProjectStructureResponse,
  SectionResponse,
  SuiteResponse,
  UpdateSectionRequest,
  UpdateSuiteRequest,
} from '@caselog/schemas';
import { TenantDatabaseService } from '../core/database/tenant-database.service';

export type StructureResult<T> =
  | { kind: 'found'; value: T }
  | { kind: 'project_not_found' }
  | { kind: 'suite_not_found' }
  | { kind: 'section_not_found' }
  | { kind: 'parent_not_found' }
  | { kind: 'name_taken'; resource: 'suite' | 'section' };

@Injectable()
export class ProjectStructureRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async get(
    organizationId: string,
    projectSlug: string,
  ): Promise<StructureResult<ProjectStructureResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true, key: true, slug: true, name: true },
      });
      if (!project) return { kind: 'project_not_found' };

      const suites = await transaction.suite.findMany({
        where: { projectId: project.id, deletedAt: null },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          position: true,
          sections: {
            where: { deletedAt: null },
            orderBy: [{ path: 'asc' }, { position: 'asc' }, { id: 'asc' }],
            select: { id: true, parentId: true, name: true, depth: true, position: true },
          },
        },
      });
      return { kind: 'found', value: { project, suites } };
    });
  }

  async createSuite(
    organizationId: string,
    projectSlug: string,
    request: CreateSuiteRequest,
  ): Promise<StructureResult<SuiteResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      await transaction.$queryRaw`SELECT id FROM projects WHERE organization_id = ${organizationId}::uuid AND id = ${project.id}::uuid FOR UPDATE`;

      const duplicate = await transaction.suite.findFirst({
        where: { projectId: project.id, name: request.name, deletedAt: null },
        select: { id: true },
      });
      if (duplicate) return { kind: 'name_taken', resource: 'suite' };
      const aggregate = await transaction.suite.aggregate({
        where: { projectId: project.id, deletedAt: null },
        _max: { position: true },
      });
      const suite = await transaction.suite.create({
        data: {
          organizationId,
          projectId: project.id,
          name: request.name,
          position: (aggregate._max.position ?? -1) + 1,
        },
        select: { id: true, name: true, position: true },
      });
      return { kind: 'found', value: suite };
    });
  }

  async updateSuite(
    organizationId: string,
    projectSlug: string,
    suiteId: string,
    request: UpdateSuiteRequest,
  ): Promise<StructureResult<SuiteResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM suites
        WHERE organization_id = ${organizationId}::uuid AND project_id = ${project.id}::uuid
          AND id = ${suiteId}::uuid AND deleted_at IS NULL FOR UPDATE
      `;
      if (locked.length === 0) return { kind: 'suite_not_found' };
      const duplicate = await transaction.suite.findFirst({
        where: { projectId: project.id, name: request.name, deletedAt: null, id: { not: suiteId } },
        select: { id: true },
      });
      if (duplicate) return { kind: 'name_taken', resource: 'suite' };
      const suite = await transaction.suite.update({
        where: { organizationId_id: { organizationId, id: suiteId } },
        data: { name: request.name },
        select: { id: true, name: true, position: true },
      });
      return { kind: 'found', value: suite };
    });
  }

  async createSection(
    organizationId: string,
    projectSlug: string,
    suiteId: string,
    request: CreateSectionRequest,
  ): Promise<StructureResult<SectionResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const suite = await transaction.suite.findUnique({
        where: {
          organizationId_id: { organizationId, id: suiteId },
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!suite) return { kind: 'suite_not_found' };
      await transaction.$queryRaw`SELECT id FROM suites WHERE organization_id = ${organizationId}::uuid AND id = ${suite.id}::uuid FOR UPDATE`;

      const parent = request.parentId
        ? await transaction.section.findUnique({
            where: {
              organizationId_id: { organizationId, id: request.parentId },
              projectId: project.id,
              suiteId: suite.id,
              deletedAt: null,
            },
            select: { id: true, path: true, depth: true },
          })
        : null;
      if (request.parentId && !parent) return { kind: 'parent_not_found' };
      const duplicate = await transaction.section.findFirst({
        where: {
          suiteId: suite.id,
          parentId: parent?.id ?? null,
          name: request.name,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (duplicate) return { kind: 'name_taken', resource: 'section' };
      const aggregate = await transaction.section.aggregate({
        where: { suiteId: suite.id, parentId: parent?.id ?? null, deletedAt: null },
        _max: { position: true },
      });
      const id = randomUUID();
      const section = await transaction.section.create({
        data: {
          organizationId,
          id,
          projectId: project.id,
          suiteId: suite.id,
          parentId: parent?.id,
          name: request.name,
          path: `${parent?.path ?? ''}/${id}`,
          depth: (parent?.depth ?? -1) + 1,
          position: (aggregate._max.position ?? -1) + 1,
        },
        select: { id: true, parentId: true, name: true, depth: true, position: true },
      });
      return { kind: 'found', value: section };
    });
  }

  async updateSection(
    organizationId: string,
    projectSlug: string,
    sectionId: string,
    request: UpdateSectionRequest,
  ): Promise<StructureResult<SectionResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sections
        WHERE organization_id = ${organizationId}::uuid AND project_id = ${project.id}::uuid
          AND id = ${sectionId}::uuid AND deleted_at IS NULL FOR UPDATE
      `;
      if (locked.length === 0) return { kind: 'section_not_found' };
      const current = await transaction.section.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id: sectionId } },
        select: { suiteId: true, parentId: true },
      });
      const duplicate = await transaction.section.findFirst({
        where: {
          suiteId: current.suiteId,
          parentId: current.parentId,
          name: request.name,
          deletedAt: null,
          id: { not: sectionId },
        },
        select: { id: true },
      });
      if (duplicate) return { kind: 'name_taken', resource: 'section' };
      const section = await transaction.section.update({
        where: { organizationId_id: { organizationId, id: sectionId } },
        data: { name: request.name },
        select: { id: true, parentId: true, name: true, depth: true, position: true },
      });
      return { kind: 'found', value: section };
    });
  }
}
