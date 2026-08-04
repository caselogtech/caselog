import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportingService } from './application/services/reporting.service';
import { RunProgressProjectionService } from './application/services/run-progress-projection.service';
import { RunProgressRefreshQueue } from './application/services/run-progress-refresh.queue';
import { CaseExecutionHistoryRepository } from './infrastructure/repositories/case-execution-history.repository';
import { RunProgressRepository } from './infrastructure/repositories/run-progress.repository';
import { RunProgressProjectionRepository } from './infrastructure/repositories/run-progress-projection.repository';
import { ReportingController } from './presentation/controllers/reporting.controller';
import { RunProgressRefreshWorker } from './presentation/workers/run-progress-refresh.worker';

@Module({
  imports: [AuthModule],
  controllers: [ReportingController],
  providers: [
    CaseExecutionHistoryRepository,
    RunProgressProjectionRepository,
    RunProgressRepository,
    ReportingService,
    RunProgressProjectionService,
    RunProgressRefreshQueue,
    RunProgressRefreshWorker,
  ],
  exports: [RunProgressRefreshQueue],
})
export class ReportingModule {}
