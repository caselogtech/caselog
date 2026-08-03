import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectStructureController } from './presentation/controllers/project-structure.controller';
import { ProjectStructureRepository } from './infrastructure/repositories/project-structure.repository';
import { ProjectStructureService } from './application/services/project-structure.service';
import { TestCaseController } from './presentation/controllers/test-case.controller';
import { TestCaseRepository } from './infrastructure/repositories/test-case.repository';
import { TestCaseService } from './application/services/test-case.service';

@Module({
  imports: [AuthModule],
  controllers: [TestCaseController, ProjectStructureController],
  providers: [
    ProjectStructureRepository,
    ProjectStructureService,
    TestCaseRepository,
    TestCaseService,
  ],
})
export class TestCaseModule {}
