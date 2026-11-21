import { Module } from '@nestjs/common';
import { AttachmentModule } from '../attachments/public-api';
import { AuthModule } from '../auth/public-api';
import { ReleaseModule } from '../releases/public-api';
import { TestCaseModule } from '../test-cases/public-api';
import { TestRunModule } from '../test-runs/public-api';
import { AccessibilityReviewService } from './application/services/accessibility-review.service';
import { EvidenceIngestionService } from './application/services/evidence-ingestion.service';
import { EvidenceQueryService } from './application/services/evidence-query.service';
import { EvidenceSnapshotService } from './application/services/evidence-snapshot.service';
import { NativeEvidenceQueue } from './application/services/native-evidence.queue';
import { NativeEvidenceEventConsumerService } from './application/services/native-evidence-event-consumer.service';
import { NativeEvidenceMaterializerService } from './application/services/native-evidence-materializer.service';
import { NativeEvidenceReconciliationService } from './application/services/native-evidence-reconciliation.service';
import { CandidateTestScopeRepository } from './infrastructure/repositories/candidate-test-scope.repository';
import { EvidenceEventRepository } from './infrastructure/repositories/evidence-event.repository';
import { EvidenceIngestionRepository } from './infrastructure/repositories/evidence-ingestion.repository';
import { EvidenceObservationRepository } from './infrastructure/repositories/evidence-observation.repository';
import { EvidenceProcessingIssueRepository } from './infrastructure/repositories/evidence-processing-issue.repository';
import { EvidenceQueryRepository } from './infrastructure/repositories/evidence-query.repository';
import { EvidenceReconciliationRepository } from './infrastructure/repositories/evidence-reconciliation.repository';
import { EvidenceSnapshotRepository } from './infrastructure/repositories/evidence-snapshot.repository';
import { AccessibilityReviewController } from './presentation/controllers/accessibility-review.controller';
import { EvidenceController } from './presentation/controllers/evidence.controller';
import { NativeEvidenceWorker } from './presentation/workers/native-evidence.worker';

@Module({
  imports: [AttachmentModule, AuthModule, ReleaseModule, TestRunModule, TestCaseModule],
  controllers: [EvidenceController, AccessibilityReviewController],
  providers: [
    AccessibilityReviewService,
    CandidateTestScopeRepository,
    EvidenceEventRepository,
    EvidenceObservationRepository,
    EvidenceProcessingIssueRepository,
    EvidenceQueryRepository,
    EvidenceIngestionRepository,
    EvidenceSnapshotRepository,
    EvidenceReconciliationRepository,
    NativeEvidenceEventConsumerService,
    EvidenceQueryService,
    EvidenceIngestionService,
    EvidenceSnapshotService,
    NativeEvidenceMaterializerService,
    NativeEvidenceQueue,
    NativeEvidenceReconciliationService,
    NativeEvidenceWorker,
  ],
  exports: [EvidenceSnapshotService],
})
export class QualityEvidenceModule {}
