import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';
import {
  readinessEvaluationJobSchema,
  readinessReconciliationJobSchema,
} from '../../domain/models/readiness-evaluation-job';
import { ReadinessAutomatedEvaluationService } from '../../application/services/readiness-automated-evaluation.service';
import {
  READINESS_EVALUATION_FAILED_QUEUE,
  READINESS_EVALUATION_QUEUE,
  READINESS_RECONCILIATION_QUEUE,
  ReadinessEvaluationQueue,
} from '../../application/services/readiness-evaluation.queue';
import { ReadinessEvaluationRequestService } from '../../application/services/readiness-evaluation-request.service';
import { ReadinessReconciliationService } from '../../application/services/readiness-reconciliation.service';

@Injectable()
export class ReadinessEvaluationWorker implements OnModuleInit {
  constructor(
    @Inject(JobQueue) private readonly jobs: JobQueue,
    @Inject(ReadinessEvaluationQueue) private readonly queue: ReadinessEvaluationQueue,
    @Inject(ReadinessAutomatedEvaluationService)
    private readonly evaluation: ReadinessAutomatedEvaluationService,
    @Inject(ReadinessEvaluationRequestService)
    private readonly requests: ReadinessEvaluationRequestService,
    @Inject(ReadinessReconciliationService)
    private readonly reconciliation: ReadinessReconciliationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.registerWorker(READINESS_EVALUATION_QUEUE, async (payload) => {
      const job = readinessEvaluationJobSchema.parse(payload);
      await this.evaluation.evaluate(job);
    });
    await this.jobs.registerWorker(READINESS_EVALUATION_FAILED_QUEUE, async (payload) => {
      const job = readinessEvaluationJobSchema.parse(payload);
      await this.requests.markRetriesExhausted(job);
    });
    await this.jobs.registerWorker(READINESS_RECONCILIATION_QUEUE, async (payload) => {
      readinessReconciliationJobSchema.parse(payload);
      await this.reconciliation.run();
    });
    await this.queue.scheduleReconciliation();
  }
}
