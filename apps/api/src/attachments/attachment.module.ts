import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AttachmentController,
  AttachmentDownloadController,
} from './presentation/controllers/attachment.controller';
import { AttachmentRepository } from './infrastructure/repositories/attachment.repository';
import { AttachmentService } from './application/services/attachment.service';
import { CaseAttachmentService } from './application/services/case-attachment.service';
import { CaseAttachmentController } from './presentation/controllers/case-attachment.controller';
import { CaseAttachmentQueryRepository } from './infrastructure/repositories/case-attachment-query.repository';
import { CaseAttachmentUploadRepository } from './infrastructure/repositories/case-attachment-upload.repository';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentController, AttachmentDownloadController, CaseAttachmentController],
  providers: [
    AttachmentRepository,
    AttachmentService,
    CaseAttachmentQueryRepository,
    CaseAttachmentUploadRepository,
    CaseAttachmentService,
  ],
  exports: [AttachmentService],
})
export class AttachmentModule {}
