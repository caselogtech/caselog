import { Global, Module } from '@nestjs/common';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { TenantDatabaseService } from './application/services/tenant-database.service';

@Global()
@Module({
  providers: [PrismaService, TenantDatabaseService],
  exports: [PrismaService, TenantDatabaseService],
})
export class DatabaseModule {}
