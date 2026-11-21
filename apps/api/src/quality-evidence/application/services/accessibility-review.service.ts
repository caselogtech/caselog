import { createHash } from 'node:crypto';
import type {
  AccessibilityReviewRequest,
  CreateCandidateReportUploadRequest,
  OrganizationAccessPrincipal,
  OrganizationSessionPrincipal,
} from '@caselog/schemas';
import { evidenceIngestResponseSchema } from '@caselog/schemas/evidence';
import { Inject, Injectable } from '@nestjs/common';
import {
  type CandidateReportContext,
  CandidateReportService,
} from '../../../attachments/public-api';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { AuthService } from '../../../auth/public-api';
import { ReleaseCandidateReferenceService } from '../../../releases/public-api';
import { EvidenceIngestionRepository } from '../../infrastructure/repositories/evidence-ingestion.repository';

@Injectable()
export class AccessibilityReviewService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ReleaseCandidateReferenceService)
    private readonly candidates: ReleaseCandidateReferenceService,
    @Inject(CandidateReportService) private readonly reports: CandidateReportService,
    @Inject(EvidenceIngestionRepository) private readonly evidence: EvidenceIngestionRepository,
  ) {}
  async createUpload(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
    request: CreateCandidateReportUploadRequest,
  ) {
    this.authorize(principal);
    return this.reports.createUpload(
      await this.context(principal.organizationId, projectSlug, candidateId),
      principal.sub,
      request,
    );
  }
  async completeUpload(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
    uploadId: string,
  ) {
    this.authorize(principal);
    return this.reports.complete(
      await this.context(principal.organizationId, projectSlug, candidateId),
      principal.sub,
      uploadId,
    );
  }
  async download(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
    reportId: string,
  ) {
    return this.reports.download(
      await this.context(principal.organizationId, projectSlug, candidateId),
      reportId,
    );
  }
  async record(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
    idempotencyKey: string,
    request: AccessibilityReviewRequest,
  ) {
    this.authorize(principal);
    const context = await this.context(principal.organizationId, projectSlug, candidateId);
    const reports = await this.reports.requireReports(context, request.reportIds);
    const reviewer = await this.auth.me({
      sub: principal.sub,
      sid: principal.sid,
      tokenType: 'session',
    });
    const now = new Date();
    const result = await this.evidence.ingest({
      organizationId: context.organizationId,
      projectSlug,
      producer: { type: 'manual_review', key: 'caselog.accessibility-reviews', schemaVersion: 1 },
      idempotencyKey,
      requestHash: createHash('sha256')
        .update(JSON.stringify({ candidateId, actorId: principal.sub, ...request }))
        .digest('hex'),
      manualReview: {
        expectedObservationId: request.expectedObservationId,
        actorId: principal.sub,
      },
      request: {
        candidateId,
        metricKey: 'accessibility.manual_review',
        metricVersion: '1.0.0',
        state: 'available',
        dimensions: request.dimensions,
        value: { type: 'integer', value: request.outcome === 'ok' ? 1 : 0 },
        observedAt: now.toISOString(),
        expiresAt: null,
        source: { type: 'accessibility_review', id: idempotencyKey, revision: '1', url: null },
        details: {
          outcome: request.outcome,
          actorId: principal.sub,
          reviewerName: reviewer.displayName,
          tools: request.tools,
          keyboardNavigation: request.keyboardNavigation,
          screenReader: request.screenReader,
          reportIds: request.reportIds,
          reportNames: request.reportIds.map(
            (id) => reports.find((report) => report.id === id)?.fileName ?? id,
          ),
          notes: request.notes,
        },
        supersedesObservationId: null,
      },
    });
    if (result.kind === 'found') return evidenceIngestResponseSchema.parse(result.value);
    if (result.kind === 'review_changed')
      throw new ResourceConflictError(
        'accessibility_review_changed',
        'A newer accessibility review exists. Reload before recording another review',
      );
    if (result.kind === 'idempotency_conflict')
      throw new ResourceConflictError(
        'idempotency_key_reused',
        'The idempotency key was already used for a different review',
      );
    throw new ResourceNotFoundError('release_candidate');
  }
  private authorize(
    principal: OrganizationAccessPrincipal,
  ): asserts principal is OrganizationSessionPrincipal {
    if (
      principal.tokenType !== 'organization' ||
      !['owner', 'admin', 'lead'].includes(principal.role)
    )
      throw new AuthorizationDeniedError();
  }
  private async context(
    organizationId: string,
    projectSlug: string,
    candidateId: string,
  ): Promise<CandidateReportContext> {
    const candidate = await this.candidates.resolve(organizationId, candidateId);
    // The release reference owns project identity; the evidence repository resolves its public slug.
    if (!(await this.evidence.projectExists(organizationId, projectSlug, candidate.projectId)))
      throw new ResourceNotFoundError('release_candidate');
    return { organizationId, projectId: candidate.projectId, candidateId };
  }
}
