import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';
import {
  NATIVE_EVIDENCE_QUEUE,
  NativeEvidenceQueue,
} from '../../application/services/native-evidence.queue';
import { NativeEvidenceReconciliationService } from '../../application/services/native-evidence-reconciliation.service';

@Injectable()
export class NativeEvidenceWorker implements OnModuleInit {
  constructor(
    @Inject(JobQueue) private readonly jobs: JobQueue,
    @Inject(NativeEvidenceQueue) private readonly queue: NativeEvidenceQueue,
    @Inject(NativeEvidenceReconciliationService)
    private readonly reconciliation: NativeEvidenceReconciliationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.registerWorker(NATIVE_EVIDENCE_QUEUE, () => this.reconciliation.run());
    await this.queue.schedule();
  }
}
