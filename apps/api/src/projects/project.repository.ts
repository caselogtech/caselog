import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateProjectRequest, ProjectSummary } from '@caselog/schemas';
import { TenantDatabaseService } from '../core/database/tenant-database.service';
import { Prisma } from '../generated/prisma/client';
import { RunStatus } from '../generated/prisma/enums';
import { DEFAULT_PROJECT_STATUSES } from './project-defaults';

type ProjectPage = {
  items: ProjectSummary[];
  nextCursor: string | null;
};

export type CreateProjectResult =
  | { kind: 'created'; value: ProjectSummary }
  | { kind: 'key_conflict' }
  | { kind: 'slug_conflict' };

export type ArchiveProjectResult =
  | { kind: 'archived' }
  | { kind: 'project_not_found' }
  | { kind: 'open_runs' };

@Injectable()
export class ProjectRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async create(
    organizationId: string,
    request: CreateProjectRequest,
  ): Promise<CreateProjectResult> {
    try {
      return await this.tenantDatabase.run(organizationId, async (transaction) => {
        const existing = await transaction.project.findFirst({
          where: { OR: [{ key: request.key }, { slug: request.slug }] },
          select: { key: true, slug: true },
        });
        if (existing?.key === request.key) return { kind: 'key_conflict' };
        if (existing?.slug === request.slug) return { kind: 'slug_conflict' };

        const project = await transaction.project.create({
          data: { organizationId, ...request },
          select: {
            id: true,
            key: true,
            slug: true,
            name: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        await transaction.resultStatus.createMany({
          data: DEFAULT_PROJECT_STATUSES.map(
            ([key, name, color, icon, isFinal, countsAsFailure], position) => ({
              organizationId,
              projectId: project.id,
              key,
              name,
              color,
              icon,
              isFinal,
              countsAsFailure,
              position,
            }),
          ),
        });
        const suite = await transaction.suite.create({
          data: { organizationId, projectId: project.id, name: 'Main suite' },
          select: { id: true },
        });
        const sectionId = randomUUID();
        await transaction.section.create({
          data: {
            organizationId,
            id: sectionId,
            projectId: project.id,
            suiteId: suite.id,
            name: 'Getting started',
            path: `/${sectionId}`,
            depth: 0,
          },
        });
        return {
          kind: 'created',
          value: {
            ...project,
            caseCount: 0,
            activeRunCount: 0,
            createdAt: project.createdAt.toISOString(),
            updatedAt: project.updatedAt.toISOString(),
          },
        };
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(',')
        : String(error.meta?.target ?? '');
      return target.includes('slug') ? { kind: 'slug_conflict' } : { kind: 'key_conflict' };
    }
  }

  async archive(organizationId: string, projectSlug: string): Promise<ArchiveProjectResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM projects
        WHERE organization_id = ${organizationId}::uuid
          AND slug = ${projectSlug}
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      const projectId = project[0]?.id;
      if (!projectId) return { kind: 'project_not_found' };
      const openRuns = await transaction.testRun.count({
        where: {
          projectId,
          status: { in: [RunStatus.DRAFT, RunStatus.ACTIVE] },
          deletedAt: null,
        },
      });
      if (openRuns > 0) return { kind: 'open_runs' };
      await transaction.project.update({
        where: { organizationId_id: { organizationId, id: projectId } },
        data: { deletedAt: new Date() },
      });
      return { kind: 'archived' };
    });
  }

  async list(
    organizationId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<ProjectPage> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const projects = await transaction.project.findMany({
        where: { deletedAt: null },
        cursor: cursor ? { organizationId_id: { organizationId, id: cursor } } : undefined,
        skip: cursor ? 1 : undefined,
        take: limit + 1,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          key: true,
          slug: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              testCases: { where: { deletedAt: null } },
              testRuns: { where: { deletedAt: null, status: 'ACTIVE' } },
            },
          },
        },
      });

      const hasNextPage = projects.length > limit;
      const page = hasNextPage ? projects.slice(0, limit) : projects;
      return {
        items: page.map(({ _count, createdAt, updatedAt, ...project }) => ({
          ...project,
          caseCount: _count.testCases,
          activeRunCount: _count.testRuns,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
        })),
        nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }
}
