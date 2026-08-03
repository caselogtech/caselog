import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportingService } from './application/services/reporting.service';
import { CaseExecutionHistoryRepository } from './infrastructure/repositories/case-execution-history.repository';
import { RunProgressRepository } from './infrastructure/repositories/run-progress.repository';
import { ReportingController } from './presentation/controllers/reporting.controller';

@Module({
  imports: [AuthModule],
  controllers: [ReportingController],
  providers: [CaseExecutionHistoryRepository, RunProgressRepository, ReportingService],
})
export class ReportingModule {}
