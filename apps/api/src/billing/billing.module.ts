import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InstanceModule } from '../instance/public-api';
import { BillingAccountService } from './application/services/billing-account.service';
import { BillingAccountRepository } from './infrastructure/repositories/billing-account.repository';
import { BillingAccountController } from './presentation/controllers/billing-account.controller';

@Module({
  imports: [AuthModule, InstanceModule],
  controllers: [BillingAccountController],
  providers: [BillingAccountRepository, BillingAccountService],
  exports: [BillingAccountService],
})
export class BillingModule {}
