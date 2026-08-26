import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';
import { appendIntegrationEvent } from '../../../core/integration-events/public-api';
import type { ReleaseIntegrationEvent } from '../../application/events/release-integration-event';

export function appendReleaseIntegrationEvent(
  transaction: TenantTransaction,
  event: ReleaseIntegrationEvent,
): Promise<void> {
  return appendIntegrationEvent(transaction, event);
}
