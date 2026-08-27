import { Inject, Injectable } from '@nestjs/common';
import type { PersistedIntegrationEvent } from '../../../core/integration-events/public-api';
import {
  markIntegrationEventsConsumed,
  readUnconsumedIntegrationEvents,
} from '../../../core/integration-events/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { QUALITY_EVIDENCE_INTEGRATION_EVENT } from '../../../quality-evidence/public-api';

export const READINESS_EVIDENCE_EVENT_CONSUMER = 'release-readiness.evidence-revisions';

@Injectable()
export class ReadinessEventRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  read(organizationId: string, limit: number): Promise<PersistedIntegrationEvent[]> {
    return this.tenantDatabase.run(organizationId, (transaction) =>
      readUnconsumedIntegrationEvents(transaction, {
        organizationId,
        consumerName: READINESS_EVIDENCE_EVENT_CONSUMER,
        eventNames: [QUALITY_EVIDENCE_INTEGRATION_EVENT.candidateRevisionAdvanced],
        limit,
      }),
    );
  }

  markConsumed(organizationId: string, eventId: string): Promise<void> {
    return this.tenantDatabase.run(organizationId, (transaction) =>
      markIntegrationEventsConsumed(transaction, {
        organizationId,
        consumerName: READINESS_EVIDENCE_EVENT_CONSUMER,
        eventIds: [eventId],
      }),
    );
  }
}
