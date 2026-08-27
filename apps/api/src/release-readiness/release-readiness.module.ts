import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReleaseModule } from '../releases/public-api';
import { QualityEvidenceModule } from '../quality-evidence/public-api';
import { CandidatePolicyAssignmentService } from './application/services/candidate-policy-assignment.service';
import { ReadinessAutomatedEvaluationService } from './application/services/readiness-automated-evaluation.service';
import { ReadinessDecisionService } from './application/services/readiness-decision.service';
import { ReadinessEvaluationQueue } from './application/services/readiness-evaluation.queue';
import { ReadinessEvaluationRequestService } from './application/services/readiness-evaluation-request.service';
import { ReadinessEventConsumerService } from './application/services/readiness-event-consumer.service';
import { ReadinessPolicyService } from './application/services/readiness-policy.service';
import { ReadinessReconciliationService } from './application/services/readiness-reconciliation.service';
import { ReadinessWaiverService } from './application/services/readiness-waiver.service';
import { CandidatePolicyAssignmentRepository } from './infrastructure/repositories/candidate-policy-assignment.repository';
import { ReadinessDecisionRepository } from './infrastructure/repositories/readiness-decision.repository';
import { ReadinessDecisionQueryRepository } from './infrastructure/repositories/readiness-decision-query.repository';
import { ReadinessEvaluationRequestRepository } from './infrastructure/repositories/readiness-evaluation-request.repository';
import { ReadinessEventRepository } from './infrastructure/repositories/readiness-event.repository';
import { ReadinessPolicyRepository } from './infrastructure/repositories/readiness-policy.repository';
import { ReadinessReconciliationRepository } from './infrastructure/repositories/readiness-reconciliation.repository';
import { ReadinessWaiverQueryRepository } from './infrastructure/repositories/readiness-waiver-query.repository';
import { ReadinessWaiverRepository } from './infrastructure/repositories/readiness-waiver.repository';
import { CandidatePolicyAssignmentController } from './presentation/controllers/candidate-policy-assignment.controller';
import {
  ReadinessDecisionController,
  ReadinessDecisionDetailController,
} from './presentation/controllers/readiness-decision.controller';
import { ReadinessPolicyController } from './presentation/controllers/readiness-policy.controller';
import { ReadinessWaiverController } from './presentation/controllers/readiness-waiver.controller';
import { ReadinessEvaluationWorker } from './presentation/workers/readiness-evaluation.worker';

@Module({
  imports: [AuthModule, ReleaseModule, QualityEvidenceModule],
  controllers: [
    ReadinessPolicyController,
    CandidatePolicyAssignmentController,
    ReadinessDecisionController,
    ReadinessDecisionDetailController,
    ReadinessWaiverController,
  ],
  providers: [
    ReadinessPolicyRepository,
    ReadinessPolicyService,
    CandidatePolicyAssignmentRepository,
    CandidatePolicyAssignmentService,
    ReadinessDecisionRepository,
    ReadinessDecisionQueryRepository,
    ReadinessDecisionService,
    ReadinessEvaluationRequestRepository,
    ReadinessEvaluationQueue,
    ReadinessEvaluationRequestService,
    ReadinessAutomatedEvaluationService,
    ReadinessEventRepository,
    ReadinessEventConsumerService,
    ReadinessReconciliationRepository,
    ReadinessReconciliationService,
    ReadinessWaiverRepository,
    ReadinessWaiverQueryRepository,
    ReadinessWaiverService,
    ReadinessEvaluationWorker,
  ],
})
export class ReleaseReadinessModule {}
