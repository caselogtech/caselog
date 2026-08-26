import { Inject, Injectable } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';

export const NATIVE_EVIDENCE_QUEUE = {
  name: 'quality-evidence-native-reconciliation',
  policy: 'singleton',
  retryLimit: 5,
  retryDelay: 10,
  retryBackoff: true,
  expireInSeconds: 300,
  deleteAfterSeconds: 86_400,
  deadLetter: 'quality-evidence-native-reconciliation-failed',
} as const;

const SCHEDULE_KEY = 'quality-evidence-native-reconciliation';

@Injectable()
export class NativeEvidenceQueue {
  constructor(@Inject(JobQueue) private readonly jobs: JobQueue) {}

  schedule(): Promise<void> {
    return this.jobs.scheduleRecurring(NATIVE_EVIDENCE_QUEUE.name, SCHEDULE_KEY, '* * * * *', {});
  }
}
