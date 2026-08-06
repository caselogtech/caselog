import { describe, expect, it } from 'vitest';
import { JobQueue, type JobQueueDefinition } from '../../../core/jobs/application/ports/job-queue';
import {
  ISSUE_STATUS_SYNC_QUEUE,
  IssueStatusSyncQueue,
} from '../../application/services/issue-status-sync.queue';

const payload = {
  organizationId: '019c2f66-a1f4-7000-8000-000000000001',
  connectionId: '019c2f66-a1f4-7000-8000-000000000002',
};

describe('IssueStatusSyncQueue', () => {
  it('uses one recurring and singleton key per connection', async () => {
    const jobs = new RecordingJobQueue();
    const queue = new IssueStatusSyncQueue(jobs, {
      allowPrivateNetworks: false,
      timeoutMs: 10_000,
      maxResponseBytes: 2_000_000,
      webBaseUrl: 'https://caselog.example',
      syncCron: '*/10 * * * *',
    });

    await queue.ensureScheduled(payload);
    await queue.enqueue(payload);
    await queue.unschedule(payload);

    const key = `${payload.organizationId}:${payload.connectionId}`;
    expect(jobs.scheduled).toEqual({
      queueName: ISSUE_STATUS_SYNC_QUEUE.name,
      scheduleKey: key,
      cron: '*/10 * * * *',
      payload,
    });
    expect(jobs.enqueued).toEqual({
      queueName: ISSUE_STATUS_SYNC_QUEUE.name,
      singletonKey: key,
      payload,
    });
    expect(jobs.unscheduled).toEqual({ queueName: ISSUE_STATUS_SYNC_QUEUE.name, scheduleKey: key });
  });
});

class RecordingJobQueue extends JobQueue {
  scheduled: unknown;
  enqueued: unknown;
  unscheduled: unknown;

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

  unscheduleRecurring(queueName: string, scheduleKey: string): Promise<void> {
    this.unscheduled = { queueName, scheduleKey };
    return Promise.resolve();
  }
}
