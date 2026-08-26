import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReleaseModule } from '../releases/public-api';
import { QualityEvidenceModule } from '../quality-evidence/public-api';
import { CandidatePolicyAssignmentService } from './application/services/candidate-policy-assignment.service';
import { ReadinessDecisionService } from './application/services/readiness-decision.service';
import { ReadinessPolicyService } from './application/services/readiness-policy.service';
import { CandidatePolicyAssignmentRepository } from './infrastructure/repositories/candidate-policy-assignment.repository';
import { ReadinessDecisionRepository } from './infrastructure/repositories/readiness-decision.repository';
import { ReadinessPolicyRepository } from './infrastructure/repositories/readiness-policy.repository';
import { CandidatePolicyAssignmentController } from './presentation/controllers/candidate-policy-assignment.controller';
import {
  ReadinessDecisionController,
  ReadinessDecisionDetailController,
} from './presentation/controllers/readiness-decision.controller';
import { ReadinessPolicyController } from './presentation/controllers/readiness-policy.controller';

@Module({
  imports: [AuthModule, ReleaseModule, QualityEvidenceModule],
  controllers: [
    ReadinessPolicyController,
    CandidatePolicyAssignmentController,
    ReadinessDecisionController,
    ReadinessDecisionDetailController,
  ],
  providers: [
    ReadinessPolicyRepository,
    ReadinessPolicyService,
    CandidatePolicyAssignmentRepository,
    CandidatePolicyAssignmentService,
    ReadinessDecisionRepository,
    ReadinessDecisionService,
  ],
})
export class ReleaseReadinessModule {}
