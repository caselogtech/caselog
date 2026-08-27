import { Inject, Injectable } from '@nestjs/common';
import type { PersistedIntegrationEvent } from '../../../core/integration-events/public-api';
import { QUALITY_EVIDENCE_INTEGRATION_EVENT } from '../../../quality-evidence/public-api';
import { ReadinessEventRepository } from '../../infrastructure/repositories/readiness-event.repository';
import { ReadinessEvaluationRequestService } from './readiness-evaluation-request.service';

@Injectable()
export class ReadinessEventConsumerService {
  constructor(
    @Inject(ReadinessEventRepository)
    private readonly events: ReadinessEventRepository,
    @Inject(ReadinessEvaluationRequestService)
    private readonly requests: ReadinessEvaluationRequestService,
  ) {}

  async processBatch(
    organizationId: string,
    limit: number,
  ): Promise<{ processed: number; requested: number }> {
    const events = await this.events.read(organizationId, limit);
    let requested = 0;
    for (const event of events) {
      const payload = evidenceRevisionPayload(event);
      const result = await this.requests.request({
        organizationId,
        candidateId: payload.candidateId,
        evidenceRevision: payload.evidenceRevision,
        trigger: 'EVIDENCE_CHANGED',
      });
      if (result.kind === 'requested') requested += 1;
      await this.events.markConsumed(organizationId, event.id);
    }
    return { processed: events.length, requested };
  }
}

function evidenceRevisionPayload(event: PersistedIntegrationEvent): {
  candidateId: string;
  evidenceRevision: number;
} {
  if (
    event.name !== QUALITY_EVIDENCE_INTEGRATION_EVENT.candidateRevisionAdvanced ||
    event.schemaVersion !== 1
  ) {
    throw new Error(
      `Unsupported readiness integration event: ${event.name}@${event.schemaVersion}`,
    );
  }
  const candidateId = event.payload.candidateId;
  const evidenceRevision = event.payload.evidenceRevision;
  if (
    typeof candidateId !== 'string' ||
    typeof evidenceRevision !== 'number' ||
    !Number.isInteger(evidenceRevision) ||
    evidenceRevision < 0
  ) {
    throw new Error(`Invalid evidence revision event payload: ${event.id}`);
  }
  return { candidateId, evidenceRevision };
}
