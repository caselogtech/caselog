import { Inject, Injectable } from '@nestjs/common';
import type { ProjectSummary } from '@caselog/schemas';
import { TenantDatabaseService } from '../core/database/tenant-database.service';

type ProjectPage = {
  items: ProjectSummary[];
  nextCursor: string | null;
};

@Injectable()
export class ProjectRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

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
