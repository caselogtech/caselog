import { ProjectStructureCreateRepository } from './infrastructure/repositories/project-structure-create.repository';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/public-api';
import { ProjectStructureController } from './presentation/controllers/project-structure.controller';
import { ProjectStructureRepository } from './infrastructure/repositories/project-structure.repository';
import { ProjectStructureService } from './application/services/project-structure.service';
import { TestCaseController } from './presentation/controllers/test-case.controller';
import { TestCaseRepository } from './infrastructure/repositories/test-case.repository';
import { TestCaseService } from './application/services/test-case.service';
import { TestCaseWriteRepository } from './infrastructure/repositories/test-case-write.repository';

@Module({
  imports: [AuthModule],
  controllers: [TestCaseController, ProjectStructureController],
  providers: [
    ProjectStructureRepository,
    ProjectStructureCreateRepository,
    ProjectStructureService,
    TestCaseRepository,
    TestCaseWriteRepository,
    TestCaseService,
  ],
})
export class TestCaseModule {}
