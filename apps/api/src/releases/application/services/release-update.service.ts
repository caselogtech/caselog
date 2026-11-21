import { Inject, Injectable } from '@nestjs/common';
import {
  type OrganizationAccessPrincipal,
  type UpdateReleaseRequest,
  type UpdateReleaseResponse,
  updateReleaseResponseSchema,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { ReleaseUpdateRepository } from '../../infrastructure/repositories/release-update.repository';

@Injectable()
export class ReleaseUpdateService {
  constructor(
    @Inject(ReleaseUpdateRepository) private readonly releases: ReleaseUpdateRepository,
  ) {}

  async update(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    releaseId: string,
    request: UpdateReleaseRequest,
  ): Promise<UpdateReleaseResponse> {
    if (
      principal.tokenType !== 'organization' ||
      !['owner', 'admin', 'lead'].includes(principal.role)
    )
      throw new AuthorizationDeniedError();
    const result = await this.releases.update(
      principal.organizationId,
      projectSlug,
      releaseId,
      principal.sub,
      request,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'release_not_found') throw new ResourceNotFoundError('release');
    if (result.kind === 'environment_not_found') throw new ResourceNotFoundError('environment');
    if (result.kind === 'environment_archived')
      throw new ResourceConflictError(
        'environment_archived',
        'An archived environment cannot receive a release',
      );
    if (result.kind === 'finalized')
      throw new ResourceConflictError('release_finalized', 'A finalized release cannot be edited');
    if (result.kind === 'stale')
      throw new ResourceConflictError(
        'release_changed',
        'This release changed. Reload it before saving your changes',
      );
    if (result.kind !== 'found') throw new Error('Unexpected release update result');
    return updateReleaseResponseSchema.parse({ release: result.value });
  }
}
