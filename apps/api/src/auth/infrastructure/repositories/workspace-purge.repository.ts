import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';

export type WorkspacePurgeCandidatePage = {
  ids: string[];
  nextCursor: string | null;
};

@Injectable()
export class WorkspacePurgeRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listCandidates(
    deletedBefore: Date,
    cursor: string | null,
    limit: number,
  ): Promise<WorkspacePurgeCandidatePage> {
    const organizations = await this.prisma.organization.findMany({
      where: { deletedAt: { lte: deletedBefore } },
      orderBy: { id: 'asc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
      select: { id: true },
    });
    const hasNextPage = organizations.length > limit;
    const page = organizations.slice(0, limit);
    return {
      ids: page.map(({ id }) => id),
      nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async claim(organizationId: string): Promise<boolean> {
    const [result] = await this.prisma.$queryRaw<Array<{ claimed: boolean }>>`
      SELECT public.claim_expired_workspace(${organizationId}::UUID) AS claimed
    `;
    return result?.claimed ?? false;
  }

  async purge(organizationId: string): Promise<boolean> {
    const [result] = await this.prisma.$queryRaw<Array<{ purged: boolean }>>`
      SELECT public.purge_expired_workspace(${organizationId}::UUID) AS purged
    `;
    return result?.purged ?? false;
  }
}
