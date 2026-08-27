import { Inject, Injectable } from '@nestjs/common';
import type { ReadinessEvaluationJob } from '../../domain/models/readiness-evaluation-job';
import {
  ReadinessEvaluationRequestRepository,
  type ReadinessEvaluationRequestResult,
} from '../../infrastructure/repositories/readiness-evaluation-request.repository';
import { ReadinessEvaluationQueue } from './readiness-evaluation.queue';

@Injectable()
export class ReadinessEvaluationRequestService {
  constructor(
    @Inject(ReadinessEvaluationRequestRepository)
    private readonly requests: ReadinessEvaluationRequestRepository,
    @Inject(ReadinessEvaluationQueue) private readonly queue: ReadinessEvaluationQueue,
  ) {}

  async request(input: {
    organizationId: string;
    candidateId: string;
    evidenceRevision: number;
    trigger: ReadinessEvaluationJob['trigger'];
  }): Promise<ReadinessEvaluationRequestResult> {
    const result = await this.requests.request(input);
    if (result.kind === 'requested') await this.queue.enqueue(result.job);
    return result;
  }

  markRetriesExhausted(job: ReadinessEvaluationJob): Promise<boolean> {
    return this.requests.markFailed(job, 'evaluation_retries_exhausted');
  }
}
