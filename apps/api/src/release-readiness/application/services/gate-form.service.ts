import { ReadinessEvaluationRequestService } from './readiness-evaluation-request.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  validateGateFormAnswers,
  type CreateCandidateReportUploadRequest,
  type GateFormResponseRequest,
  type OrganizationAccessPrincipal,
  type OrganizationSessionPrincipal,
} from '@caselog/schemas';
import { CandidateReportService } from '../../../attachments/public-api';
import {
  AuthorizationDeniedError,
  InvalidPayloadError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { GateFormEvidenceService } from '../../../quality-evidence/public-api';
import { ReleaseCandidateReferenceService } from '../../../releases/public-api';
import { ReadinessDecisionRepository } from '../../infrastructure/repositories/readiness-decision.repository';

@Injectable()
export class GateFormService {
  private readonly logger = new Logger(GateFormService.name);
  constructor(
    @Inject(ReleaseCandidateReferenceService)
    private readonly candidates: ReleaseCandidateReferenceService,
    @Inject(ReadinessDecisionRepository) private readonly readiness: ReadinessDecisionRepository,
    @Inject(GateFormEvidenceService) private readonly evidence: GateFormEvidenceService,
    @Inject(CandidateReportService) private readonly reports: CandidateReportService,
    @Inject(ReadinessEvaluationRequestService)
    private readonly evaluationRequests: ReadinessEvaluationRequestService,
  ) {}
  async record(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
    gateId: string,
    idempotencyKey: string,
    request: GateFormResponseRequest,
  ) {
    this.authorize(principal);
    const context = await this.context(principal.organizationId, projectSlug, candidateId);
    const gate = context.gates.find(({ id }) => id === gateId);
    if (!gate?.form) throw new ResourceNotFoundError('gate_form');
    const invalidFields = validateGateFormAnswers(gate.form, request.values);
    if (invalidFields.length)
      throw new InvalidPayloadError(
        'invalid_gate_form',
        'Complete the required fields using the configured field types',
        { fields: invalidFields },
      );
    const reportIds = [
      ...new Set(
        gate.form.fields
          .filter(({ type }) => type === 'files')
          .flatMap(({ key }) => {
            const value = request.values[key];
            return Array.isArray(value) ? value : [];
          }),
      ),
    ];
    if (reportIds.length > 30)
      throw new InvalidPayloadError('invalid_gate_form', 'A form supports up to 30 reports');
    const reports = reportIds.length ? await this.reports.requireReports(context, reportIds) : [];
    const response = await this.evidence.record({
      principal,
      projectSlug,
      candidateId,
      gateId,
      idempotencyKey,
      request,
      reports: reports.map(({ id, fileName }) => ({ id, fileName })),
    });
    try {
      await this.evaluationRequests.request({
        organizationId: principal.organizationId,
        candidateId,
        evidenceRevision: response.candidateRevision,
        trigger: 'EVIDENCE_CHANGED',
      });
    } catch (error) {
      // The response and revision event are durable; reconciliation recovers a missed enqueue.
      this.logger.warn({
        event: 'readiness_evaluation.enqueue_failed',
        organizationId: principal.organizationId,
        candidateId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
    return response;
  }
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
  private authorize(
    principal: OrganizationAccessPrincipal,
  ): asserts principal is OrganizationSessionPrincipal {
    if (
      principal.tokenType !== 'organization' ||
      !['owner', 'admin', 'lead'].includes(principal.role)
    )
      throw new AuthorizationDeniedError();
  }
  private async context(organizationId: string, projectSlug: string, candidateId: string) {
    const candidate = await this.candidates.resolve(organizationId, candidateId);
    const result = await this.readiness.context({
      organizationId,
      projectId: candidate.projectId,
      projectSlug,
      candidateId,
    });
    if (result.kind !== 'found') throw new ResourceNotFoundError('release_candidate');
    return {
      organizationId,
      projectId: candidate.projectId,
      candidateId,
      gates: result.value.gates,
    };
  }
}
