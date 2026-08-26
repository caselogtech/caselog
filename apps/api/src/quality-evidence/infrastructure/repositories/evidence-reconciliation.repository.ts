import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';

@Injectable()
export class EvidenceReconciliationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listActiveOrganizationIds(cursor: string | null, limit: number): Promise<string[]> {
    const organizations = await this.prisma.organization.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit,
      select: { id: true },
    });
    return organizations.map(({ id }) => id);
  }
}
