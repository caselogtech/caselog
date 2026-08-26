import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  EvidenceIngestRequest,
  EvidenceIngestResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { evidenceIngestResponseSchema } from '@caselog/schemas/evidence';
import {
  InvalidPayloadError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { EvidenceIngestionRepository } from '../../infrastructure/repositories/evidence-ingestion.repository';
import type { EvidenceProducerIdentity } from '../ports/evidence-ingestion';

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const MAX_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1_000;

@Injectable()
export class EvidenceIngestionService {
  constructor(
    @Inject(EvidenceIngestionRepository)
    private readonly evidence: EvidenceIngestionRepository,
  ) {}

  async ingest(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    idempotencyKey: string,
    request: EvidenceIngestRequest,
  ): Promise<EvidenceIngestResponse> {
    this.validateMetric(request);
    this.validateTimeBounds(request);
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const result = await this.evidence.ingest({
      organizationId: principal.organizationId,
      projectSlug,
      producer: producerIdentity(principal),
      idempotencyKey,
      requestHash,
      request,
    });

    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'candidate_not_found') {
      throw new ResourceNotFoundError('release_candidate');
    }
    if (result.kind === 'superseded_observation_not_found') {
      throw new ResourceNotFoundError('evidence_observation');
    }
    if (result.kind === 'idempotency_conflict') {
      throw new ResourceConflictError(
        'idempotency_key_reused',
        'The idempotency key was already used for different evidence',
      );
    }
    if (result.kind === 'supersession_conflict') {
      throw new ResourceConflictError(
        'evidence_supersession_conflict',
        'Only the producer current observation for the same metric can be corrected',
      );
    }
    if (result.kind !== 'found') throw new Error(`Unhandled evidence result: ${result.kind}`);
    return evidenceIngestResponseSchema.parse(result.value);
  }

  private validateMetric(request: EvidenceIngestRequest): void {
    const expectedType =
      request.metricKey === 'test.failed_count' ? ('integer' as const) : ('percentage' as const);
    if (request.value.type !== expectedType) {
      throw new InvalidPayloadError(
        'evidence_value_type_mismatch',
        `${request.metricKey} requires a ${expectedType} value`,
      );
    }
    if (
      request.value.type === 'integer' &&
      request.value.value !== null &&
      request.value.value < 0
    ) {
      throw new InvalidPayloadError(
        'evidence_value_out_of_range',
        'Evidence integer values cannot be negative',
      );
    }
  }

  private validateTimeBounds(request: EvidenceIngestRequest): void {
    const observedAt = new Date(request.observedAt).getTime();
    const expiresAt = new Date(request.expiresAt).getTime();
    if (observedAt > Date.now() + MAX_FUTURE_SKEW_MS) {
      throw new InvalidPayloadError(
        'evidence_observed_at_in_future',
        'Evidence observation time exceeds the allowed clock skew',
      );
    }
    if (expiresAt - observedAt > MAX_FRESHNESS_MS) {
      throw new InvalidPayloadError(
        'evidence_freshness_too_long',
        'Evidence freshness cannot exceed 30 days',
      );
    }
  }
}

function producerIdentity(principal: OrganizationAccessPrincipal): EvidenceProducerIdentity {
  return principal.tokenType === 'api_token'
    ? { type: 'api_token', key: principal.apiTokenId, schemaVersion: 1 }
    : { type: 'user', key: principal.sub, schemaVersion: 1 };
}
