import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportingService } from './application/services/reporting.service';
import { ReportingRepository } from './infrastructure/repositories/reporting.repository';
import { ReportingController } from './presentation/controllers/reporting.controller';

@Module({
  imports: [AuthModule],
  controllers: [ReportingController],
  providers: [ReportingRepository, ReportingService],
})
export class ReportingModule {}
