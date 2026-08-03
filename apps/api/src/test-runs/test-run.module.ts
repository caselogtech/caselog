import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentModule } from '../attachments/attachment.module';
import { JUnitIngestRepository } from './junit-ingest.repository';
import { TestResultQueryRepository } from './test-result-query.repository';
import { TestResultRepository } from './test-result.repository';
import { TestRunController } from './test-run.controller';
import { TestRunRepository } from './test-run.repository';
import { TestRunService } from './test-run.service';

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
