import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentModule } from '../attachments/attachment.module';
import { JUnitIngestRepository } from './infrastructure/repositories/junit-ingest.repository';
import { TestResultQueryRepository } from './infrastructure/repositories/test-result-query.repository';
import { TestResultRepository } from './infrastructure/repositories/test-result.repository';
import { TestRunController } from './presentation/controllers/test-run.controller';
import { TestRunRepository } from './infrastructure/repositories/test-run.repository';
import { TestRunService } from './application/services/test-run.service';

@Module({
  imports: [AuthModule, AttachmentModule],
  controllers: [TestRunController],
  providers: [
    JUnitIngestRepository,
    TestResultQueryRepository,
    TestResultRepository,
    TestRunRepository,
    TestRunService,
  ],
})
export class TestRunModule {}
