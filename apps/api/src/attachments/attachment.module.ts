import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentController, AttachmentDownloadController } from './attachment.controller';
import { AttachmentRepository } from './attachment.repository';
import { AttachmentService } from './attachment.service';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentController, AttachmentDownloadController],
  providers: [AttachmentRepository, AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
