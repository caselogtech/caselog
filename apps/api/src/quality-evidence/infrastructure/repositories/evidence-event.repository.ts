import { Inject, Injectable } from '@nestjs/common';
import {
  markIntegrationEventsConsumed,
  readUnconsumedIntegrationEvents,
  type PersistedIntegrationEvent,
} from '../../../core/integration-events/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { RELEASE_INTEGRATION_EVENT } from '../../../releases/public-api';
import { TEST_RUN_INTEGRATION_EVENT } from '../../../test-runs/public-api';
import { NATIVE_EVIDENCE_CONSUMER } from '../../application/ports/native-evidence-write';

export const NATIVE_EVIDENCE_SOURCE_EVENTS = [
  RELEASE_INTEGRATION_EVENT.candidateCreated,
  RELEASE_INTEGRATION_EVENT.candidateTestRunLinked,
  RELEASE_INTEGRATION_EVENT.candidateTestRunRoleChanged,
  RELEASE_INTEGRATION_EVENT.candidateTestRunUnlinked,
  TEST_RUN_INTEGRATION_EVENT.evidenceSourceChanged,
] as const;

@Injectable()
export class EvidenceEventRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  read(organizationId: string, limit = 100): Promise<PersistedIntegrationEvent[]> {
    return this.tenantDatabase.run(organizationId, (transaction) =>
      readUnconsumedIntegrationEvents(transaction, {
        organizationId,
        consumerName: NATIVE_EVIDENCE_CONSUMER,
        eventNames: NATIVE_EVIDENCE_SOURCE_EVENTS,
        limit,
      }),
    );
  }

  markConsumed(organizationId: string, eventIds: string[]): Promise<void> {
    return this.tenantDatabase.run(organizationId, (transaction) =>
      markIntegrationEventsConsumed(transaction, {
        organizationId,
        consumerName: NATIVE_EVIDENCE_CONSUMER,
        eventIds,
      }),
    );
  }
}
