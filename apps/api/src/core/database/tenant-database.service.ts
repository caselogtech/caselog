import { Inject, Injectable } from '@nestjs/common';
import { organizationIdSchema } from '@caselog/schemas';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from './prisma.service';

export type TenantTransaction = Prisma.TransactionClient;

export async function runInTenant<T>(
  prisma: PrismaClient,
  organizationId: string,
  operation: (transaction: TenantTransaction) => Promise<T>,
): Promise<T> {
  const tenantId = organizationIdSchema.parse(organizationId);

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT set_config('caselog.organization_id', ${tenantId}, true)`;
    return operation(transaction);
  });
}

@Injectable()
export class TenantDatabaseService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  run<T>(
    organizationId: string,
    operation: (transaction: TenantTransaction) => Promise<T>,
  ): Promise<T> {
    return runInTenant(this.prisma, organizationId, operation);
  }
}
