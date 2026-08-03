import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../generated/prisma/client';

export function createPostgresAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({ connectionString });
}

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: createPostgresAdapter(connectionString) });
}
