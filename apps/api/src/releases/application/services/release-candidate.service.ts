import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  candidateTestRunListResponseSchema,
  candidateTestRunResponseSchema,
  createReleaseCandidateResponseSchema,
  releaseCandidateListResponseSchema,
  type CandidateTestRunListResponse,
  type CandidateTestRunResponse,
  type CreateReleaseCandidateRequest,
  type CreateReleaseCandidateResponse,
  type LinkCandidateTestRunRequest,
  type OrganizationAccessPrincipal,
  type ReleaseCandidateListQuery,
  type ReleaseCandidateListResponse,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { TestRunReferenceService } from '../../../test-runs/public-api';
import { normalizeCandidateIdentity } from '../../domain/models/release-candidate-identity';
import { CandidateTestRunRepository } from '../../infrastructure/repositories/candidate-test-run.repository';
import { ReleaseCandidateRepository } from '../../infrastructure/repositories/release-candidate.repository';

@Injectable()
export class ReleaseCandidateService {
  constructor(
    @Inject(ReleaseCandidateRepository)
    private readonly candidates: ReleaseCandidateRepository,
    @Inject(CandidateTestRunRepository)
    private readonly candidateRuns: CandidateTestRunRepository,
    @Inject(TestRunReferenceService)
    private readonly runReferences: TestRunReferenceService,
  ) {}

  async list(
    organizationId: string,
    projectSlug: string,
    releaseId: string,
    query: ReleaseCandidateListQuery,
  ): Promise<ReleaseCandidateListResponse> {
    const result = await this.candidates.list(organizationId, projectSlug, releaseId, query);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'release_not_found') throw new ResourceNotFoundError('release');
    return releaseCandidateListResponseSchema.parse(result.value);
  }

  async create(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    releaseId: string,
    idempotencyKey: string,
    request: CreateReleaseCandidateRequest,
  ): Promise<CreateReleaseCandidateResponse> {
    this.assertManage(principal);
    const normalized = normalizeCandidateIdentity(request);
    const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const result = await this.candidates.create(
      principal.organizationId,
      projectSlug,
      releaseId,
      principal.sub,
      idempotencyKey,
      requestHash,
      normalized,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'release_not_found') throw new ResourceNotFoundError('release');
    if (result.kind === 'release_finalized') throw this.finalizedRelease();
    if (result.kind === 'candidate_identity_conflict') {
      throw new ResourceConflictError(
        'release_candidate_identity_taken',
        'This candidate identity is already registered in the project',
      );
    }
    if (result.kind === 'idempotency_conflict') {
      throw new ResourceConflictError(
        'idempotency_conflict',
        'This idempotency key was already used for a different request',
      );
    }
    return createReleaseCandidateResponseSchema.parse({ candidate: result.value });
  }

  async listLinks(
    organizationId: string,
    projectSlug: string,
    candidateId: string,
  ): Promise<CandidateTestRunListResponse> {
    const result = await this.candidateRuns.list(organizationId, projectSlug, candidateId);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'candidate_not_found') throw new ResourceNotFoundError('release_candidate');
    return candidateTestRunListResponseSchema.parse({ items: result.value });
  }

  async link(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
    runId: string,
    request: LinkCandidateTestRunRequest,
  ): Promise<CandidateTestRunResponse> {
    this.assertManage(principal);
    const run = await this.runReferences.resolve(principal.organizationId, projectSlug, runId);
    const result = await this.candidateRuns.link(
      principal.organizationId,
      projectSlug,
      candidateId,
      principal.sub,
      run,
      request.role,
    );
    this.assertLinkResult(result);
    return candidateTestRunResponseSchema.parse({ link: result.value });
  }

  async unlink(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    candidateId: string,
    runId: string,
  ): Promise<void> {
    this.assertManage(principal);
    const result = await this.candidateRuns.unlink(
      principal.organizationId,
      projectSlug,
      candidateId,
      principal.sub,
      runId,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'candidate_not_found') throw new ResourceNotFoundError('release_candidate');
    if (result.kind === 'release_finalized') throw this.finalizedRelease();
  }

  private assertLinkResult(
    result: Awaited<ReturnType<CandidateTestRunRepository['link']>>,
  ): asserts result is Extract<typeof result, { kind: 'found' }> {
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'candidate_not_found') throw new ResourceNotFoundError('release_candidate');
    if (result.kind === 'release_finalized') throw this.finalizedRelease();
    if (result.kind === 'run_already_linked') {
      throw new ResourceConflictError(
        'test_run_already_linked',
        'A test run can be linked to only one release candidate',
      );
    }
  }

  private assertManage(principal: OrganizationAccessPrincipal): void {
    if (!['owner', 'admin', 'lead'].includes(principal.role)) {
      throw new AuthorizationDeniedError();
    }
  }

  private finalizedRelease(): ResourceConflictError {
    return new ResourceConflictError(
      'release_finalized',
      'Candidates and test-run links cannot change after a release is finalized',
    );
  }
}
