import { Global, Module } from '@nestjs/common';
import { JobQueue } from './application/ports/job-queue';
import { PgBossJobQueue } from './infrastructure/adapters/pg-boss-job-queue';

@Global()
@Module({
  providers: [PgBossJobQueue, { provide: JobQueue, useExisting: PgBossJobQueue }],
  exports: [JobQueue],
})
export class JobsModule {}
