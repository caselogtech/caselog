import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentModule } from '../attachments/attachment.module';
import { ReportingModule } from '../reporting/reporting.module';
import { JUnitIngestRepository } from './infrastructure/repositories/junit-ingest.repository';
import { TestResultQueryRepository } from './infrastructure/repositories/test-result-query.repository';
import { TestResultRepository } from './infrastructure/repositories/test-result.repository';
import { TestRunController } from './presentation/controllers/test-run.controller';
import { TestRunRepository } from './infrastructure/repositories/test-run.repository';
import { TestRunService } from './application/services/test-run.service';
import { ResultIngestionService } from './application/services/result-ingestion.service';
import { ResultIngestionRepository } from './infrastructure/repositories/result-ingestion.repository';
import { ResultIngestionController } from './presentation/controllers/result-ingestion.controller';
import { TestRunReferenceRepository } from './infrastructure/repositories/test-run-reference.repository';
import { TestRunReferenceService } from './application/services/test-run-reference.service';
import { TestRunEvidenceSourceService } from './application/services/test-run-evidence-source.service';
import { TestRunEvidenceSourceRepository } from './infrastructure/repositories/test-run-evidence-source.repository';

@Module({
  imports: [AuthModule, AttachmentModule, ReportingModule],
  controllers: [TestRunController, ResultIngestionController],
  providers: [
    JUnitIngestRepository,
    ResultIngestionRepository,
    ResultIngestionService,
    TestResultQueryRepository,
    TestResultRepository,
    TestRunRepository,
    TestRunService,
    TestRunReferenceRepository,
    TestRunReferenceService,
    TestRunEvidenceSourceRepository,
    TestRunEvidenceSourceService,
  ],
  exports: [TestRunReferenceService, TestRunEvidenceSourceService],
})
export class TestRunModule {}
