import { Inject, Injectable, Logger } from '@nestjs/common';
import { EvidenceReconciliationRepository } from '../../infrastructure/repositories/evidence-reconciliation.repository';
import { NativeEvidenceEventConsumerService } from './native-evidence-event-consumer.service';

const ORGANIZATION_BATCH_SIZE = 100;
const EVENT_BATCH_SIZE = 100;
const MAX_EVENTS_PER_ORGANIZATION = 1_000;

@Injectable()
export class NativeEvidenceReconciliationService {
  private readonly logger = new Logger(NativeEvidenceReconciliationService.name);

  constructor(
    @Inject(EvidenceReconciliationRepository)
    private readonly organizations: EvidenceReconciliationRepository,
    @Inject(NativeEvidenceEventConsumerService)
    private readonly consumer: NativeEvidenceEventConsumerService,
  ) {}

  async run(): Promise<void> {
    let cursor: string | null = null;
    do {
      const organizationIds = await this.organizations.listActiveOrganizationIds(
        cursor,
        ORGANIZATION_BATCH_SIZE,
      );
      for (const organizationId of organizationIds) {
        await this.processOrganization(organizationId);
      }
      cursor =
        organizationIds.length === ORGANIZATION_BATCH_SIZE
          ? (organizationIds.at(-1) ?? null)
          : null;
    } while (cursor);
  }

  private async processOrganization(organizationId: string): Promise<void> {
    let processed = 0;
    let observationsCreated = 0;
    while (processed < MAX_EVENTS_PER_ORGANIZATION) {
      const result = await this.consumer.processBatch(organizationId, EVENT_BATCH_SIZE);
      processed += result.processed;
      observationsCreated += result.observationsCreated;
      if (result.processed < EVENT_BATCH_SIZE) break;
    }
    if (processed > 0) {
      this.logger.log({
        event: 'quality_evidence.reconciled',
        organizationId,
        processed,
        observationsCreated,
      });
    }
  }
}
