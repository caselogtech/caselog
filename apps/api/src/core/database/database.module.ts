import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantDatabaseService } from './tenant-database.service';

@Global()
@Module({
  providers: [PrismaService, TenantDatabaseService],
  exports: [PrismaService, TenantDatabaseService],
})
export class DatabaseModule {}
