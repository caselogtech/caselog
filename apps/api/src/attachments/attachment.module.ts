import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/public-api';
import { AttachmentService } from './application/services/attachment.service';
import { AttachmentBlobService } from './application/services/attachment-blob.service';
import { CandidateReportService } from './application/services/candidate-report.service';
import { CaseAttachmentService } from './application/services/case-attachment.service';
import { StorageMaintenanceQueue } from './application/services/storage-maintenance.queue';
import { StorageMaintenanceService } from './application/services/storage-maintenance.service';
import { AttachmentRepository } from './infrastructure/repositories/attachment.repository';
import { AttachmentBlobRepository } from './infrastructure/repositories/attachment-blob.repository';
import { CandidateReportQueryRepository } from './infrastructure/repositories/candidate-report-query.repository';
import { CandidateReportUploadRepository } from './infrastructure/repositories/candidate-report-upload.repository';
import { CaseAttachmentQueryRepository } from './infrastructure/repositories/case-attachment-query.repository';
import { CaseAttachmentUploadRepository } from './infrastructure/repositories/case-attachment-upload.repository';
import { StorageMaintenanceRepository } from './infrastructure/repositories/storage-maintenance.repository';
import {
  AttachmentController,
  AttachmentDownloadController,
} from './presentation/controllers/attachment.controller';
import { CaseAttachmentController } from './presentation/controllers/case-attachment.controller';
import { StorageMaintenanceWorker } from './presentation/workers/storage-maintenance.worker';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentController, AttachmentDownloadController, CaseAttachmentController],
  providers: [
    CandidateReportService,
    CandidateReportUploadRepository,
    CandidateReportQueryRepository,
    AttachmentBlobRepository,
    AttachmentBlobService,
    AttachmentRepository,
    AttachmentService,
    CaseAttachmentQueryRepository,
    CaseAttachmentUploadRepository,
    CaseAttachmentService,
    StorageMaintenanceRepository,
    StorageMaintenanceService,
    StorageMaintenanceQueue,
    StorageMaintenanceWorker,
  ],
  exports: [AttachmentService, CandidateReportService],
})
export class AttachmentModule {}
