import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AssignCandidatePolicyRequest,
  CandidatePolicyAssignmentResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { candidatePolicyAssignmentResponseSchema } from '@caselog/schemas/readiness';
import { ResourceConflictError, ResourceNotFoundError } from '../../../common/errors/domain.error';
import { ReleaseCandidateReferenceService } from '../../../releases/public-api';
import { EvidenceSnapshotService } from '../../../quality-evidence/public-api';
import {
  CandidatePolicyAssignmentRepository,
  type CandidatePolicyAssignmentResult,
} from '../../infrastructure/repositories/candidate-policy-assignment.repository';

@Injectable()
export class CandidatePolicyAssignmentService {
  constructor(
    @Inject(ReleaseCandidateReferenceService)
    private readonly candidates: ReleaseCandidateReferenceService,
    @Inject(CandidatePolicyAssignmentRepository)
    private readonly assignments: CandidatePolicyAssignmentRepository,
    @Inject(EvidenceSnapshotService)
    private readonly evidence: EvidenceSnapshotService,
  ) {}

  async assign(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
    idempotencyKey: string,
    request: AssignCandidatePolicyRequest,
  ): Promise<CandidatePolicyAssignmentResponse> {
    const candidate = await this.candidates.resolve(principal.organizationId, candidateId);
    const evidence = await this.evidence.load(
      principal.organizationId,
      candidate.projectId,
      candidateId,
    );
    return this.resolve(
      await this.assignments.assign({
        organizationId: principal.organizationId,
        projectId: candidate.projectId,
        projectSlug,
        candidateId,
        policyId: request.policyId,
        actorId: principal.sub,
        idempotencyKey,
        requestHash: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
        evidenceRevision: evidence.revision,
      }),
    );
  }

  async current(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
  ): Promise<CandidatePolicyAssignmentResponse> {
    const candidate = await this.candidates.resolve(principal.organizationId, candidateId);
    const result = await this.assignments.current(
      principal.organizationId,
      projectSlug,
      candidate.projectId,
      candidateId,
    );
    if (result.kind === 'assignment_not_found')
      throw new ResourceNotFoundError('policy_assignment');
    if (result.kind !== 'found') return this.resolve(result);
    return candidatePolicyAssignmentResponseSchema.parse(result.value);
  }

  private resolve(result: CandidatePolicyAssignmentResult): CandidatePolicyAssignmentResponse {
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'candidate_not_found') throw new ResourceNotFoundError('release_candidate');
    if (result.kind === 'policy_not_found') throw new ResourceNotFoundError('release_policy');
    if (result.kind === 'assignment_not_found')
      throw new ResourceNotFoundError('policy_assignment');
    if (result.kind === 'published_version_not_found') {
      throw new ResourceConflictError(
        'release_policy_not_published',
        'The release policy has no published version',
      );
    }
    if (result.kind === 'idempotency_conflict') {
      throw new ResourceConflictError(
        'idempotency_key_reused',
        'The idempotency key was already used for another request',
      );
    }
    if (result.kind !== 'found') {
      throw new Error(`Unhandled candidate policy assignment result: ${result.kind}`);
    }
    return candidatePolicyAssignmentResponseSchema.parse(result.value);
  }
}
