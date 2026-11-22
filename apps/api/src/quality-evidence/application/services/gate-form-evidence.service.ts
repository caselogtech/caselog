import { createHash } from 'node:crypto';
import type { GateFormResponseRequest, OrganizationSessionPrincipal } from '@caselog/schemas';
import { Inject, Injectable } from '@nestjs/common';
import { AuthService } from '../../../auth/public-api';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { EvidenceIngestionRepository } from '../../infrastructure/repositories/evidence-ingestion.repository';

/** Records an already validated candidate-bound form through the durable evidence boundary. */
@Injectable()
export class GateFormEvidenceService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(EvidenceIngestionRepository) private readonly evidence: EvidenceIngestionRepository,
  ) {}
  async record(input: {
    principal: OrganizationSessionPrincipal;
    projectSlug: string;
    candidateId: string;
    gateId: string;
    idempotencyKey: string;
    request: GateFormResponseRequest;
    reports: Array<{ id: string; fileName: string }>;
  }) {
    if (!['owner', 'admin', 'lead'].includes(input.principal.role))
      throw new AuthorizationDeniedError();
    const reviewer = await this.auth.me({
      sub: input.principal.sub,
      sid: input.principal.sid,
      tokenType: 'session',
    });
    const { candidateId, gateId, request, idempotencyKey } = input;
    const result = await this.evidence.ingest({
      organizationId: input.principal.organizationId,
      projectSlug: input.projectSlug,
      producer: { type: 'manual_review', key: 'caselog.gate-forms', schemaVersion: 1 },
      idempotencyKey,
      requestHash: createHash('sha256')
        .update(JSON.stringify({ candidateId, gateId, actorId: input.principal.sub, ...request }))
        .digest('hex'),
      manualReview: {
        actorId: input.principal.sub,
        expectedObservationId: request.expectedObservationId,
      },
      request: {
        candidateId,
        metricKey: 'gate.form_response',
        metricVersion: '1.0.0',
        state: 'available',
        dimensions: { testRunRole: 'required', gateId },
        value: { type: 'integer', value: 1 },
        observedAt: new Date().toISOString(),
        expiresAt: null,
        source: { type: 'gate_form', id: idempotencyKey, revision: '1', url: null },
        details: {
          kind: 'gate_form_response',
          actorId: input.principal.sub,
          reviewerName: reviewer.displayName,
          values: request.values,
          reports: input.reports,
        },
        supersedesObservationId: null,
      },
    });
    if (result.kind === 'found') return result.value;
    if (result.kind === 'review_changed')
      throw new ResourceConflictError(
        'gate_form_changed',
        'A newer form response exists. Reload before submitting another response',
      );
    if (result.kind === 'idempotency_conflict')
      throw new ResourceConflictError(
        'idempotency_key_reused',
        'The idempotency key was already used for a different form response',
      );
    throw new ResourceNotFoundError('release_candidate');
  }
}
