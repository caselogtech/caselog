import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReleaseModule } from '../releases/public-api';
import { TestRunModule } from '../test-runs/public-api';
import { NativeEvidenceEventConsumerService } from './application/services/native-evidence-event-consumer.service';
import { EvidenceQueryService } from './application/services/evidence-query.service';
import { EvidenceIngestionService } from './application/services/evidence-ingestion.service';
import { EvidenceSnapshotService } from './application/services/evidence-snapshot.service';
import { NativeEvidenceMaterializerService } from './application/services/native-evidence-materializer.service';
import { NativeEvidenceQueue } from './application/services/native-evidence.queue';
import { NativeEvidenceReconciliationService } from './application/services/native-evidence-reconciliation.service';
import { EvidenceEventRepository } from './infrastructure/repositories/evidence-event.repository';
import { EvidenceObservationRepository } from './infrastructure/repositories/evidence-observation.repository';
import { EvidenceProcessingIssueRepository } from './infrastructure/repositories/evidence-processing-issue.repository';
import { EvidenceQueryRepository } from './infrastructure/repositories/evidence-query.repository';
import { EvidenceIngestionRepository } from './infrastructure/repositories/evidence-ingestion.repository';
import { EvidenceSnapshotRepository } from './infrastructure/repositories/evidence-snapshot.repository';
import { EvidenceReconciliationRepository } from './infrastructure/repositories/evidence-reconciliation.repository';
import { NativeEvidenceWorker } from './presentation/workers/native-evidence.worker';
import { EvidenceController } from './presentation/controllers/evidence.controller';

@Module({
  imports: [AuthModule, ReleaseModule, TestRunModule],
  controllers: [EvidenceController],
  providers: [
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
