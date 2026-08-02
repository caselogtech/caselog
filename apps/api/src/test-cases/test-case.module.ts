import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectStructureController, TestCaseController } from './test-case.controller';
import { TestCaseRepository } from './test-case.repository';
import { TestCaseService } from './test-case.service';

@Module({
  imports: [AuthModule],
  controllers: [TestCaseController, ProjectStructureController],
  providers: [TestCaseRepository, TestCaseService],
})
export class TestCaseModule {}
