import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PersistedIntegrationEvent } from '../../../core/integration-events/public-api';
import {
  RELEASE_INTEGRATION_EVENT,
  type ReleaseCandidateReference,
  ReleaseCandidateReferenceService,
} from '../../../releases/public-api';
import { TEST_RUN_INTEGRATION_EVENT } from '../../../test-runs/public-api';
import { evidenceProcessingIssueCode } from '../../domain/models/evidence-processing-issue';
import { EvidenceEventRepository } from '../../infrastructure/repositories/evidence-event.repository';
import { EvidenceProcessingIssueRepository } from '../../infrastructure/repositories/evidence-processing-issue.repository';
import { NativeEvidenceMaterializerService } from './native-evidence-materializer.service';

export type NativeEvidenceConsumptionResult = {
  processed: number;
  observationsCreated: number;
  halted?: true;
};

@Injectable()
export class NativeEvidenceEventConsumerService {
  private readonly logger = new Logger(NativeEvidenceEventConsumerService.name);

  constructor(
    @Inject(EvidenceEventRepository) private readonly events: EvidenceEventRepository,
    @Inject(ReleaseCandidateReferenceService)
    private readonly candidates: ReleaseCandidateReferenceService,
    @Inject(NativeEvidenceMaterializerService)
    private readonly materializer: NativeEvidenceMaterializerService,
    @Inject(EvidenceProcessingIssueRepository)
    private readonly issues: EvidenceProcessingIssueRepository,
  ) {}

  async processBatch(
    organizationId: string,
    limit = 100,
  ): Promise<NativeEvidenceConsumptionResult> {
    const events = await this.events.read(organizationId, limit);
    let processed = 0;
    let observationsCreated = 0;
    for (const event of events) {
      processed += 1;
      const candidate = await this.resolveCandidate(event);
      if (!candidate) {
        await this.events.markConsumed(organizationId, [event.id]);
        continue;
      }
      try {
        const result = await this.materializer.materialize(
          organizationId,
          candidate,
          [event.id],
          new Date(event.occurredAt),
        );
        observationsCreated += result.created;
      } catch (error) {
        const code = evidenceProcessingIssueCode(error);
        await this.issues.recordFailure({
          organizationId,
          projectId: candidate.projectId,
          candidateId: candidate.id,
          sourceEventId: event.id,
          code,
        });
        this.logger.warn({
          event: 'quality_evidence.processing_failed',
          organizationId,
          candidateId: candidate.id,
          sourceEventId: event.id,
          code,
        });
        return { processed, observationsCreated, halted: true };
      }
    }
    return { processed, observationsCreated };
  }

  private async resolveCandidate(
    event: PersistedIntegrationEvent,
  ): Promise<ReleaseCandidateReference | null> {
    if (event.schemaVersion !== 1) {
      throw new Error(`Unsupported integration event schema version: ${event.schemaVersion}`);
    }
    if (event.name === TEST_RUN_INTEGRATION_EVENT.evidenceSourceChanged) {
      const testRunId = stringPayload(event, 'testRunId');
      return this.candidates.resolveForTestRun(event.organizationId, testRunId);
    }
    if (
      event.name === RELEASE_INTEGRATION_EVENT.candidateCreated ||
      event.name === RELEASE_INTEGRATION_EVENT.candidateTestRunLinked ||
      event.name === RELEASE_INTEGRATION_EVENT.candidateTestRunRoleChanged ||
      event.name === RELEASE_INTEGRATION_EVENT.candidateTestRunUnlinked
    ) {
      return this.candidates.resolve(event.organizationId, stringPayload(event, 'candidateId'));
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
