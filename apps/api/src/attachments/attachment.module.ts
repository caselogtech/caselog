import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AttachmentController,
  AttachmentDownloadController,
} from './presentation/controllers/attachment.controller';
import { CaseAttachmentController } from './presentation/controllers/case-attachment.controller';
import { AttachmentService } from './application/services/attachment.service';
import { CaseAttachmentService } from './application/services/case-attachment.service';
import { StorageMaintenanceQueue } from './application/services/storage-maintenance.queue';
import { StorageMaintenanceService } from './application/services/storage-maintenance.service';
import { AttachmentRepository } from './infrastructure/repositories/attachment.repository';
import { CaseAttachmentQueryRepository } from './infrastructure/repositories/case-attachment-query.repository';
import { CaseAttachmentUploadRepository } from './infrastructure/repositories/case-attachment-upload.repository';
import { StorageMaintenanceRepository } from './infrastructure/repositories/storage-maintenance.repository';
import { StorageMaintenanceWorker } from './presentation/workers/storage-maintenance.worker';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentController, AttachmentDownloadController, CaseAttachmentController],
  providers: [
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
  exports: [AttachmentService],
})
export class AttachmentModule {}
