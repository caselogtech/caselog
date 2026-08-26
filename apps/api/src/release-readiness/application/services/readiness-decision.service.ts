import { Inject, Injectable } from '@nestjs/common';
import type {
  CandidateReadinessResponse,
  OrganizationAccessPrincipal,
  ReadinessDecisionListQuery,
  ReadinessDecisionListResponse,
  ReadinessDecisionResponse,
} from '@caselog/schemas';
import {
  candidateReadinessResponseSchema,
  readinessDecisionListResponseSchema,
  readinessDecisionResponseSchema,
} from '@caselog/schemas/readiness';
import { ResourceConflictError, ResourceNotFoundError } from '../../../common/errors/domain.error';
import {
  type CandidateEvidenceSnapshotObservation,
  EvidenceSnapshotService,
} from '../../../quality-evidence/public-api';
import { ReleaseCandidateReferenceService } from '../../../releases/public-api';
import type { ReadinessEvidence } from '../../domain/models/readiness-evidence';
import {
  READINESS_EVALUATOR_VERSION,
  evaluateReadiness,
} from '../../domain/policies/readiness-evaluator';
import {
  ReadinessDecisionRepository,
  type ReadinessDecisionResult,
  type ReadinessEvaluationContextResult,
} from '../../infrastructure/repositories/readiness-decision.repository';

@Injectable()
export class ReadinessDecisionService {
  constructor(
    @Inject(ReleaseCandidateReferenceService)
    private readonly candidates: ReleaseCandidateReferenceService,
    @Inject(EvidenceSnapshotService)
    private readonly evidence: EvidenceSnapshotService,
    @Inject(ReadinessDecisionRepository)
    private readonly decisions: ReadinessDecisionRepository,
  ) {}

  async evaluate(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
  ): Promise<CandidateReadinessResponse> {
    const candidate = await this.candidates.resolve(principal.organizationId, candidateId);
    const context = this.resolveContext(
      await this.decisions.context({
        organizationId: principal.organizationId,
        projectId: candidate.projectId,
        projectSlug,
        candidateId,
      }),
    );
    const snapshot = await this.evidence.load(
      principal.organizationId,
      candidate.projectId,
      candidateId,
    );
    const evaluatedAt = new Date();
    const evaluation = evaluateReadiness({
      gates: context.gates,
      evidence: snapshot.observations.map(toReadinessEvidence),
      evaluatedAt: evaluatedAt.toISOString(),
    });
    return this.resolveDecision(
      await this.decisions.record({
        organizationId: principal.organizationId,
        projectId: candidate.projectId,
        candidateId,
        assignmentId: context.assignment.id,
        policyVersionId: context.assignment.policyVersion.id,
        evidenceRevision: snapshot.revision,
        evaluatorVersion: READINESS_EVALUATOR_VERSION,
        evaluatedAt,
        evaluatedById: principal.sub,
        trigger: 'MANUAL',
        evaluation,
        gates: context.gates,
      }),
    );
  }

  async current(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
  ): Promise<CandidateReadinessResponse> {
    const candidate = await this.candidates.resolve(principal.organizationId, candidateId);
    this.resolveContext(
      await this.decisions.context({
        organizationId: principal.organizationId,
        projectId: candidate.projectId,
        projectSlug,
        candidateId,
      }),
    );
    const snapshot = await this.evidence.load(
      principal.organizationId,
      candidate.projectId,
      candidateId,
    );
    return this.resolveDecision(
      await this.decisions.current(principal.organizationId, candidateId, snapshot.revision),
    );
  }

  async history(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
    query: ReadinessDecisionListQuery,
  ): Promise<ReadinessDecisionListResponse> {
    const candidate = await this.candidates.resolve(principal.organizationId, candidateId);
    const result = await this.decisions.history({
      organizationId: principal.organizationId,
      projectId: candidate.projectId,
      projectSlug,
      candidateId,
      query,
    });
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'candidate_not_found') throw new ResourceNotFoundError('release_candidate');
    if (result.kind === 'cursor_not_found') throw new ResourceNotFoundError('readiness_cursor');
    if (result.kind !== 'found') {
      throw new Error(`Unhandled readiness decision history result: ${result.kind}`);
    }
    return readinessDecisionListResponseSchema.parse(result.value);
  }

  async detail(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    decisionId: string,
  ): Promise<ReadinessDecisionResponse> {
    const result = await this.decisions.detail({
      organizationId: principal.organizationId,
      projectSlug,
      decisionId,
    });
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'decision_not_found') throw new ResourceNotFoundError('readiness_decision');
    if (result.kind !== 'found') {
      throw new Error(`Unhandled readiness decision detail result: ${result.kind}`);
    }
    return readinessDecisionResponseSchema.parse(result.value);
  }

  private resolveContext(result: ReadinessEvaluationContextResult) {
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'candidate_not_found') throw new ResourceNotFoundError('release_candidate');
    if (result.kind === 'assignment_not_found') {
      throw new ResourceConflictError(
        'release_policy_not_assigned',
        'Assign a published release policy before evaluating this candidate',
      );
    }
    if (result.kind !== 'found') {
      throw new Error(`Unhandled readiness evaluation context result: ${result.kind}`);
    }
    return result.value;
  }

  private resolveDecision(result: ReadinessDecisionResult): CandidateReadinessResponse {
    if (result.kind === 'assignment_changed') {
      throw new ResourceConflictError(
        'release_policy_assignment_changed',
        'The candidate policy assignment changed during evaluation; retry the request',
      );
    }
    if (result.kind === 'projection_not_found') {
      throw new ResourceNotFoundError('readiness_decision');
    }
    if (result.kind !== 'found') {
      throw new Error(`Unhandled readiness decision result: ${result.kind}`);
    }
    return candidateReadinessResponseSchema.parse(result.value);
  }
}

function toReadinessEvidence(observation: CandidateEvidenceSnapshotObservation): ReadinessEvidence {
  const value =
    observation.value.value === null
      ? null
      : observation.value.type === 'percentage'
        ? { type: 'percentage' as const, value: observation.value.value }
        : { type: 'integer' as const, value: observation.value.value };
  return {
    observationId: observation.id,
    producerId: observation.producerId,
    metricKey: observation.metricKey,
    metricVersion: observation.metricVersion,
    dimensions: observation.dimensions,
    state: observation.state.toUpperCase() as ReadinessEvidence['state'],
    value,
    observedAt: observation.observedAt,
    expiresAt: observation.expiresAt,
    trust: observation.trust.toUpperCase() as ReadinessEvidence['trust'],
  };
}
