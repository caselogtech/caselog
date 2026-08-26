import { Inject, Injectable } from '@nestjs/common';
import type { PersistedIntegrationEvent } from '../../../core/integration-events/public-api';
import {
  RELEASE_INTEGRATION_EVENT,
  ReleaseCandidateReferenceService,
} from '../../../releases/public-api';
import { TEST_RUN_INTEGRATION_EVENT } from '../../../test-runs/public-api';
import { EvidenceEventRepository } from '../../infrastructure/repositories/evidence-event.repository';
import { NativeEvidenceMaterializerService } from './native-evidence-materializer.service';

export type NativeEvidenceConsumptionResult = {
  processed: number;
  observationsCreated: number;
};

@Injectable()
export class NativeEvidenceEventConsumerService {
  constructor(
    @Inject(EvidenceEventRepository) private readonly events: EvidenceEventRepository,
    @Inject(ReleaseCandidateReferenceService)
    private readonly candidates: ReleaseCandidateReferenceService,
    @Inject(NativeEvidenceMaterializerService)
    private readonly materializer: NativeEvidenceMaterializerService,
  ) {}

  async processBatch(
    organizationId: string,
    limit = 100,
  ): Promise<NativeEvidenceConsumptionResult> {
    const events = await this.events.read(organizationId, limit);
    let observationsCreated = 0;
    for (const event of events) {
      const candidateId = await this.resolveCandidateId(event);
      if (!candidateId) {
        await this.events.markConsumed(organizationId, [event.id]);
        continue;
      }
      const result = await this.materializer.materialize(
        organizationId,
        candidateId,
        [event.id],
        new Date(event.occurredAt),
      );
      observationsCreated += result.created;
    }
    return { processed: events.length, observationsCreated };
  }

  private async resolveCandidateId(event: PersistedIntegrationEvent): Promise<string | null> {
    if (event.schemaVersion !== 1) {
      throw new Error(`Unsupported integration event schema version: ${event.schemaVersion}`);
    }
    if (event.name === TEST_RUN_INTEGRATION_EVENT.evidenceSourceChanged) {
      const testRunId = stringPayload(event, 'testRunId');
      const candidate = await this.candidates.resolveForTestRun(event.organizationId, testRunId);
      return candidate?.id ?? null;
    }
    if (
      event.name === RELEASE_INTEGRATION_EVENT.candidateCreated ||
      event.name === RELEASE_INTEGRATION_EVENT.candidateTestRunLinked ||
      event.name === RELEASE_INTEGRATION_EVENT.candidateTestRunRoleChanged ||
      event.name === RELEASE_INTEGRATION_EVENT.candidateTestRunUnlinked
    ) {
      return stringPayload(event, 'candidateId');
    }
    throw new Error(`Unsupported native evidence event: ${event.name}`);
  }
}

function stringPayload(event: PersistedIntegrationEvent, key: string): string {
  const value = event.payload[key];
  if (typeof value !== 'string') {
    throw new Error(`Integration event ${event.name} does not contain ${key}`);
  }
  return value;
}
