import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentController } from './attachment.controller';
import { AttachmentRepository } from './attachment.repository';
import { AttachmentService } from './attachment.service';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentController],
  providers: [AttachmentRepository, AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
