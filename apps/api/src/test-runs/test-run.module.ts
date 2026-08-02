import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TestRunController } from './test-run.controller';
import { TestRunRepository } from './test-run.repository';
import { TestRunService } from './test-run.service';

@Module({
  imports: [AuthModule],
  controllers: [TestRunController],
  providers: [TestRunRepository, TestRunService],
})
export class TestRunModule {}
