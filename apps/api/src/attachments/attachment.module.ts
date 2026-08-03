import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AttachmentController,
  AttachmentDownloadController,
} from './presentation/controllers/attachment.controller';
import { AttachmentRepository } from './infrastructure/repositories/attachment.repository';
import { AttachmentService } from './application/services/attachment.service';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentController, AttachmentDownloadController],
  providers: [AttachmentRepository, AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
