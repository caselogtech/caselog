import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';
import { appendIntegrationEvent } from '../../../core/integration-events/public-api';
import type { TestRunEvidenceSourceChangedEvent } from '../../application/events/test-run-integration-event';

export function appendTestRunIntegrationEvent(
  transaction: TenantTransaction,
  event: TestRunEvidenceSourceChangedEvent,
): Promise<void> {
  return appendIntegrationEvent(transaction, event);
}
