import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectStructureController } from './project-structure.controller';
import { ProjectStructureRepository } from './project-structure.repository';
import { ProjectStructureService } from './project-structure.service';
import { TestCaseController } from './test-case.controller';
import { TestCaseRepository } from './test-case.repository';
import { TestCaseService } from './test-case.service';

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
