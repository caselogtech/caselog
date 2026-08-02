import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateSectionRequest,
  CreateSuiteRequest,
  MoveSectionRequest,
  MoveSuiteRequest,
  ProjectStructureResponse,
  SectionResponse,
  SuiteResponse,
  UpdateSectionRequest,
  UpdateSuiteRequest,
} from '@caselog/schemas';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../core/database/tenant-database.service';

type StructureSection = ProjectStructureResponse['suites'][number]['sections'][number];

export type StructureResult<T> =
  | { kind: 'found'; value: T }
  | { kind: 'project_not_found' }
  | { kind: 'suite_not_found' }
  | { kind: 'section_not_found' }
  | { kind: 'parent_not_found' }
  | { kind: 'name_taken'; resource: 'suite' | 'section' }
  | { kind: 'not_empty'; resource: 'suite' | 'section' }
  | { kind: 'section_cycle' };

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
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            select: { id: true, parentId: true, name: true, depth: true, position: true },
          },
        },
      });
      return {
        kind: 'found',
        value: {
          project,
          suites: suites.map(({ sections, ...suite }) => ({
            ...suite,
            sections: this.orderSections(sections),
          })),
        },
      };
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
        select: {
          id: true,
          suiteId: true,
          parentId: true,
          name: true,
          depth: true,
          position: true,
        },
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
        select: {
          id: true,
          suiteId: true,
          parentId: true,
          name: true,
          depth: true,
          position: true,
        },
      });
      return { kind: 'found', value: section };
    });
  }

  async moveSuite(
    organizationId: string,
    projectSlug: string,
    suiteId: string,
    request: MoveSuiteRequest,
  ): Promise<StructureResult<SuiteResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      await this.lockProject(transaction, organizationId, project.id);

      const suites = await transaction.suite.findMany({
        where: { projectId: project.id, deletedAt: null },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      if (!suites.some((suite) => suite.id === suiteId)) return { kind: 'suite_not_found' };

      const orderedIds = suites.map((suite) => suite.id).filter((id) => id !== suiteId);
      orderedIds.splice(Math.min(request.position, orderedIds.length), 0, suiteId);
      await this.setSuitePositions(transaction, organizationId, orderedIds);
      const suite = await transaction.suite.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id: suiteId } },
        select: { id: true, name: true, position: true },
      });
      return { kind: 'found', value: suite };
    });
  }

  async moveSection(
    organizationId: string,
    projectSlug: string,
    sectionId: string,
    request: MoveSectionRequest,
  ): Promise<StructureResult<SectionResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      await this.lockProject(transaction, organizationId, project.id);

      const current = await transaction.section.findUnique({
        where: {
          organizationId_id: { organizationId, id: sectionId },
          projectId: project.id,
          deletedAt: null,
        },
        select: {
          id: true,
          suiteId: true,
          parentId: true,
          name: true,
          path: true,
          depth: true,
        },
      });
      if (!current) return { kind: 'section_not_found' };
      const suite = await transaction.suite.findUnique({
        where: {
          organizationId_id: { organizationId, id: request.suiteId },
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!suite) return { kind: 'suite_not_found' };
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
      if (parent && (parent.path === current.path || parent.path.startsWith(`${current.path}/`))) {
        return { kind: 'section_cycle' };
      }
      const duplicate = await transaction.section.findFirst({
        where: {
          suiteId: suite.id,
          parentId: parent?.id ?? null,
          name: current.name,
          deletedAt: null,
          id: { not: current.id },
        },
        select: { id: true },
      });
      if (duplicate) return { kind: 'name_taken', resource: 'section' };

      const sameParent = current.suiteId === suite.id && current.parentId === (parent?.id ?? null);
      const sourceIds = sameParent
        ? []
        : (
            await transaction.section.findMany({
              where: {
                suiteId: current.suiteId,
                parentId: current.parentId,
                deletedAt: null,
                id: { not: current.id },
              },
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: { id: true },
            })
          ).map((section) => section.id);
      const targetIds = (
        await transaction.section.findMany({
          where: {
            suiteId: suite.id,
            parentId: parent?.id ?? null,
            deletedAt: null,
            id: { not: current.id },
          },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true },
        })
      ).map((section) => section.id);
      targetIds.splice(Math.min(request.position, targetIds.length), 0, current.id);

      const subtree = await transaction.section.findMany({
        where: {
          projectId: project.id,
          deletedAt: null,
          OR: [{ path: current.path }, { path: { startsWith: `${current.path}/` } }],
        },
        orderBy: [{ depth: 'asc' }, { id: 'asc' }],
        select: { id: true, path: true, depth: true },
      });
      const newPath = `${parent?.path ?? ''}/${current.id}`;
      const newDepth = (parent?.depth ?? -1) + 1;
      const depthDelta = newDepth - current.depth;

      await transaction.section.update({
        where: { organizationId_id: { organizationId, id: current.id } },
        data: {
          suiteId: suite.id,
          parentId: parent?.id ?? null,
          path: newPath,
          depth: newDepth,
          position: request.position,
        },
      });
      for (const descendant of subtree.filter((section) => section.id !== current.id)) {
        await transaction.section.update({
          where: { organizationId_id: { organizationId, id: descendant.id } },
          data: {
            suiteId: suite.id,
            path: `${newPath}${descendant.path.slice(current.path.length)}`,
            depth: descendant.depth + depthDelta,
          },
        });
      }
      await transaction.testCase.updateMany({
        where: { sectionId: { in: subtree.map((section) => section.id) } },
        data: { suiteId: suite.id },
      });
      if (!sameParent) await this.setSectionPositions(transaction, organizationId, sourceIds);
      await this.setSectionPositions(transaction, organizationId, targetIds);

      const moved = await transaction.section.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id: current.id } },
        select: {
          id: true,
          suiteId: true,
          parentId: true,
          name: true,
          depth: true,
          position: true,
        },
      });
      return { kind: 'found', value: moved };
    });
  }

  async deleteSection(
    organizationId: string,
    projectSlug: string,
    sectionId: string,
  ): Promise<StructureResult<undefined>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      await this.lockProject(transaction, organizationId, project.id);
      const section = await transaction.section.findUnique({
        where: {
          organizationId_id: { organizationId, id: sectionId },
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true, suiteId: true, parentId: true },
      });
      if (!section) return { kind: 'section_not_found' };
      const childCount = await transaction.section.count({ where: { parentId: section.id } });
      const caseCount = await transaction.testCase.count({ where: { sectionId: section.id } });
      if (childCount > 0 || caseCount > 0) return { kind: 'not_empty', resource: 'section' };
      await transaction.section.delete({
        where: { organizationId_id: { organizationId, id: section.id } },
      });
      const siblingIds = (
        await transaction.section.findMany({
          where: { suiteId: section.suiteId, parentId: section.parentId, deletedAt: null },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true },
        })
      ).map((sibling) => sibling.id);
      await this.setSectionPositions(transaction, organizationId, siblingIds);
      return { kind: 'found', value: undefined };
    });
  }

  async deleteSuite(
    organizationId: string,
    projectSlug: string,
    suiteId: string,
  ): Promise<StructureResult<undefined>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      await this.lockProject(transaction, organizationId, project.id);
      const suite = await transaction.suite.findUnique({
        where: {
          organizationId_id: { organizationId, id: suiteId },
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!suite) return { kind: 'suite_not_found' };
      const sectionCount = await transaction.section.count({ where: { suiteId: suite.id } });
      const caseCount = await transaction.testCase.count({ where: { suiteId: suite.id } });
      if (sectionCount > 0 || caseCount > 0) return { kind: 'not_empty', resource: 'suite' };
      await transaction.suite.delete({
        where: { organizationId_id: { organizationId, id: suite.id } },
      });
      const suiteIds = (
        await transaction.suite.findMany({
          where: { projectId: project.id, deletedAt: null },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true },
        })
      ).map((remaining) => remaining.id);
      await this.setSuitePositions(transaction, organizationId, suiteIds);
      return { kind: 'found', value: undefined };
    });
  }

  private async lockProject(
    transaction: TenantTransaction,
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM projects WHERE organization_id = ${organizationId}::uuid AND id = ${projectId}::uuid FOR UPDATE`;
  }

  private async setSuitePositions(
    transaction: TenantTransaction,
    organizationId: string,
    ids: string[],
  ): Promise<void> {
    for (const [position, id] of ids.entries()) {
      await transaction.suite.update({
        where: { organizationId_id: { organizationId, id } },
        data: { position },
      });
    }
  }

  private async setSectionPositions(
    transaction: TenantTransaction,
    organizationId: string,
    ids: string[],
  ): Promise<void> {
    for (const [position, id] of ids.entries()) {
      await transaction.section.update({
        where: { organizationId_id: { organizationId, id } },
        data: { position },
      });
    }
  }

  private orderSections(sections: StructureSection[]): StructureSection[] {
    const children = new Map<string | null, StructureSection[]>();
    for (const section of sections) {
      const siblings = children.get(section.parentId) ?? [];
      siblings.push(section);
      children.set(section.parentId, siblings);
    }
    const ordered: StructureSection[] = [];
    const visited = new Set<string>();
    const appendChildren = (parentId: string | null): void => {
      for (const section of children.get(parentId) ?? []) {
        if (visited.has(section.id)) continue;
        visited.add(section.id);
        ordered.push(section);
        appendChildren(section.id);
      }
    };
    appendChildren(null);
    for (const section of sections) {
      if (!visited.has(section.id)) ordered.push(section);
    }
    return ordered;
  }
}
