import { appendIntegrationEvent } from '../../../core/integration-events/public-api';
import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';
import type { CandidateEvidenceRevisionAdvancedEvent } from '../../application/events/evidence-integration-event';

export function appendEvidenceIntegrationEvent(
  transaction: TenantTransaction,
  event: CandidateEvidenceRevisionAdvancedEvent,
): Promise<void> {
  return appendIntegrationEvent(transaction, event);
}
