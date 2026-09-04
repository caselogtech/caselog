import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/public-api';
import { InstanceModule } from '../instance/public-api';
import { StaffAccessService } from './application/services/staff-access.service';
import { StaffConsoleService } from './application/services/staff-console.service';
import { createStaffConfig, STAFF_CONFIG } from './infrastructure/config/staff.config';
import { StaffRepository } from './infrastructure/repositories/staff.repository';
import { StaffController } from './presentation/controllers/staff.controller';
import { StaffAccessGuard } from './presentation/guards/staff-access.guard';

@Module({
  imports: [AuthModule, InstanceModule],
  controllers: [StaffController],
  providers: [
    { provide: STAFF_CONFIG, useFactory: createStaffConfig },
    StaffAccessGuard,
    StaffAccessService,
    StaffConsoleService,
    StaffRepository,
  ],
})
export class StaffModule {}
