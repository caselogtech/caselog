import { describe, expect, it } from 'vitest';
import { JobQueue, type JobQueueDefinition } from '../../../core/jobs/application/ports/job-queue';
import {
  READINESS_EVALUATION_QUEUE,
  READINESS_RECONCILIATION_QUEUE,
  ReadinessEvaluationQueue,
} from '../../application/services/readiness-evaluation.queue';
import type { ReadinessEvaluationJob } from '../../domain/models/readiness-evaluation-job';

const job = {
  organizationId: '019c2f66-a1f4-7000-8000-000000000001',
  candidateId: '019c2f66-a1f4-7000-8000-000000000002',
  assignmentId: '019c2f66-a1f4-7000-8000-000000000003',
  evidenceRevision: 7,
  evaluatorVersion: '1.0.0',
  trigger: 'EVIDENCE_CHANGED',
} as const satisfies ReadinessEvaluationJob;

describe('ReadinessEvaluationQueue', () => {
  it('keys evaluation jobs by tenant, candidate, assignment, and evidence revision', async () => {
    const jobs = new RecordingJobQueue();
    const queue = new ReadinessEvaluationQueue(jobs);

    await queue.enqueue(job);

    expect(jobs.enqueued).toEqual({
      queueName: READINESS_EVALUATION_QUEUE.name,
      singletonKey: [
        job.organizationId,
        job.candidateId,
        job.assignmentId,
        job.evidenceRevision,
        job.evaluatorVersion,
      ].join(':'),
      payload: job,
    });
  });

  it('uses one recurring reconciliation schedule', async () => {
    const jobs = new RecordingJobQueue();
    const queue = new ReadinessEvaluationQueue(jobs);

    await queue.scheduleReconciliation();

    expect(jobs.scheduled).toEqual({
      queueName: READINESS_RECONCILIATION_QUEUE.name,
      scheduleKey: 'release-readiness-reconciliation',
      cron: '* * * * *',
      payload: {},
    });
  });
});

class RecordingJobQueue extends JobQueue {
  enqueued: unknown;
  scheduled: unknown;

  registerWorker<T extends object>(
    _definition: JobQueueDefinition,
    _handler: (payload: T) => Promise<void>,
  ): Promise<void> {
    return Promise.resolve();
  }

  enqueueLatest<T extends object>(
    queueName: string,
    singletonKey: string,
    payload: T,
  ): Promise<void> {
    this.enqueued = { queueName, singletonKey, payload };
    return Promise.resolve();
  }

  scheduleRecurring<T extends object>(
    queueName: string,
    scheduleKey: string,
    cron: string,
    payload: T,
  ): Promise<void> {
    this.scheduled = { queueName, scheduleKey, cron, payload };
    return Promise.resolve();
  }

  unscheduleRecurring(_queueName: string, _scheduleKey: string): Promise<void> {
    return Promise.resolve();
  }
}
