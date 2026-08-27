import { Inject, Injectable, Logger } from '@nestjs/common';
import { EvidenceSnapshotService } from '../../../quality-evidence/public-api';
import { READINESS_EVALUATOR_VERSION } from '../../domain/policies/readiness-evaluator';
import { ReadinessReconciliationRepository } from '../../infrastructure/repositories/readiness-reconciliation.repository';
import { ReadinessEvaluationRequestService } from './readiness-evaluation-request.service';
import { ReadinessEventConsumerService } from './readiness-event-consumer.service';

const ORGANIZATION_BATCH_SIZE = 100;
const EVENT_BATCH_SIZE = 100;
const MAX_EVENTS_PER_ORGANIZATION = 1_000;
const CANDIDATE_BATCH_SIZE = 100;

@Injectable()
export class ReadinessReconciliationService {
  private readonly logger = new Logger(ReadinessReconciliationService.name);

  constructor(
    @Inject(ReadinessReconciliationRepository)
    private readonly reconciliation: ReadinessReconciliationRepository,
    @Inject(ReadinessEventConsumerService)
    private readonly events: ReadinessEventConsumerService,
    @Inject(EvidenceSnapshotService)
    private readonly evidence: EvidenceSnapshotService,
    @Inject(ReadinessEvaluationRequestService)
    private readonly requests: ReadinessEvaluationRequestService,
  ) {}

  async run(): Promise<void> {
    let cursor: string | null = null;
    do {
      const organizationIds = await this.reconciliation.listActiveOrganizationIds(
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
    const eventResult = await this.processEvents(organizationId);
    let candidateCursor: string | null = null;
    let candidatesChecked = 0;
    let evaluationsRequested = eventResult.requested;
    do {
      const candidates = await this.reconciliation.listCandidates(
        organizationId,
        candidateCursor,
        CANDIDATE_BATCH_SIZE,
      );
      for (const candidate of candidates) {
        candidatesChecked += 1;
        const snapshot = await this.evidence.load(
          organizationId,
          candidate.projectId,
          candidate.candidateId,
        );
        if (!needsEvaluation(candidate, snapshot.revision)) continue;
        const result = await this.requests.request({
          organizationId,
          candidateId: candidate.candidateId,
          evidenceRevision: snapshot.revision,
          trigger: 'RECONCILIATION',
        });
        if (result.kind === 'requested') evaluationsRequested += 1;
      }
      candidateCursor =
        candidates.length === CANDIDATE_BATCH_SIZE
          ? (candidates.at(-1)?.candidateId ?? null)
          : null;
    } while (candidateCursor);

    if (eventResult.processed > 0 || evaluationsRequested > 0) {
      this.logger.log({
        event: 'release_readiness.reconciled',
        organizationId,
        eventsProcessed: eventResult.processed,
        candidatesChecked,
        evaluationsRequested,
      });
    }
  }

  private async processEvents(
    organizationId: string,
  ): Promise<{ processed: number; requested: number }> {
    let processed = 0;
    let requested = 0;
    while (processed < MAX_EVENTS_PER_ORGANIZATION) {
      const result = await this.events.processBatch(organizationId, EVENT_BATCH_SIZE);
      processed += result.processed;
      requested += result.requested;
      if (result.processed < EVENT_BATCH_SIZE) break;
    }
    return { processed, requested };
  }
}

function needsEvaluation(
  candidate: Awaited<ReturnType<ReadinessReconciliationRepository['listCandidates']>>[number],
  evidenceRevision: number,
): boolean {
  const projection = candidate.projection;
  if (!projection || projection.assignmentId !== candidate.assignmentId) return true;
  if (
    projection.state === 'FAILED' &&
    projection.targetEvidenceRevision === evidenceRevision &&
    projection.targetEvaluatorVersion === READINESS_EVALUATOR_VERSION
  ) {
    return false;
  }
  const decision = projection.decision;
  return (
    !decision ||
    decision.assignmentId !== candidate.assignmentId ||
    decision.evidenceRevision !== evidenceRevision ||
    decision.evaluatorVersion !== READINESS_EVALUATOR_VERSION
  );
}
