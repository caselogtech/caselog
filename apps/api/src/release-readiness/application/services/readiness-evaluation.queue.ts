import { Inject, Injectable } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';
import type {
  ReadinessEvaluationJob,
  ReadinessReconciliationJob,
} from '../../domain/models/readiness-evaluation-job';

export const READINESS_EVALUATION_QUEUE = {
  name: 'release-readiness-evaluation',
  policy: 'singleton',
  retryLimit: 5,
  retryDelay: 10,
  retryBackoff: true,
  expireInSeconds: 300,
  deleteAfterSeconds: 86_400,
  deadLetter: 'release-readiness-evaluation-failed',
} as const;

export const READINESS_EVALUATION_FAILED_QUEUE = {
  name: READINESS_EVALUATION_QUEUE.deadLetter,
  policy: 'standard',
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 300,
  deleteAfterSeconds: 2_592_000,
} as const;

export const READINESS_RECONCILIATION_QUEUE = {
  name: 'release-readiness-reconciliation',
  policy: 'singleton',
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 300,
  deleteAfterSeconds: 86_400,
  deadLetter: 'release-readiness-reconciliation-failed',
} as const;

const RECONCILIATION_SCHEDULE_KEY = 'release-readiness-reconciliation';

@Injectable()
export class ReadinessEvaluationQueue {
  constructor(@Inject(JobQueue) private readonly jobs: JobQueue) {}

  enqueue(payload: ReadinessEvaluationJob): Promise<void> {
    return this.jobs.enqueueLatest(
      READINESS_EVALUATION_QUEUE.name,
      `${payload.organizationId}:${payload.candidateId}:${payload.assignmentId}:${payload.evidenceRevision}:${payload.evaluatorVersion}`,
      payload,
    );
  }

  scheduleReconciliation(): Promise<void> {
    const payload: ReadinessReconciliationJob = {};
    return this.jobs.scheduleRecurring(
      READINESS_RECONCILIATION_QUEUE.name,
      RECONCILIATION_SCHEDULE_KEY,
      '* * * * *',
      payload,
    );
  }
}
