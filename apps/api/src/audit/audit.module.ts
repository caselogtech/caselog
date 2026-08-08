import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditLogService } from './application/services/audit-log.service';
import { AuditLogRepository } from './infrastructure/repositories/audit-log.repository';
import { AuditLogController } from './presentation/controllers/audit-log.controller';

@Module({
  imports: [AuthModule],
  controllers: [AuditLogController],
  providers: [AuditLogRepository, AuditLogService],
})
export class AuditModule {}
