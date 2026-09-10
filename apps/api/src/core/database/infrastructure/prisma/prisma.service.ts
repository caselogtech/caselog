import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../../../generated/prisma/client';
import { createPostgresAdapter } from './prisma-client';

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return databaseUrl;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: createPostgresAdapter(getDatabaseUrl()) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    if (process.env.NODE_ENV === 'production') {
      const roles = await this.$queryRaw<Array<{ current_user: string }>>`SELECT current_user`;
      if (roles[0]?.current_user !== 'caselog_app') {
        throw new Error('Production DATABASE_URL must connect with the caselog_app role');
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
