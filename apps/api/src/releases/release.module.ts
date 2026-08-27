import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TestRunModule } from '../test-runs/public-api';
import { EnvironmentService } from './application/services/environment.service';
import { ReleaseCandidateService } from './application/services/release-candidate.service';
import { ReleaseCandidateReferenceService } from './application/services/release-candidate-reference.service';
import { ReleaseOverviewReferenceService } from './application/services/release-overview-reference.service';
import { ReleaseService } from './application/services/release.service';
import { EnvironmentRepository } from './infrastructure/repositories/environment.repository';
import { CandidateTestRunRepository } from './infrastructure/repositories/candidate-test-run.repository';
import { ReleaseCandidateRepository } from './infrastructure/repositories/release-candidate.repository';
import { ReleaseCandidateReferenceRepository } from './infrastructure/repositories/release-candidate-reference.repository';
import { ReleaseRepository } from './infrastructure/repositories/release.repository';
import { CandidateTestRunController } from './presentation/controllers/candidate-test-run.controller';
import { EnvironmentController } from './presentation/controllers/environment.controller';
import { ReleaseCandidateController } from './presentation/controllers/release-candidate.controller';
import { ReleaseController } from './presentation/controllers/release.controller';

@Module({
  imports: [AuthModule, TestRunModule],
  controllers: [
    EnvironmentController,
    ReleaseController,
    ReleaseCandidateController,
    CandidateTestRunController,
  ],
  providers: [
    EnvironmentRepository,
    EnvironmentService,
    ReleaseRepository,
    ReleaseService,
    ReleaseCandidateRepository,
    CandidateTestRunRepository,
    ReleaseCandidateService,
    ReleaseCandidateReferenceRepository,
    ReleaseCandidateReferenceService,
    ReleaseOverviewReferenceService,
  ],
  exports: [ReleaseCandidateReferenceService, ReleaseOverviewReferenceService],
})
export class ReleaseModule {}
