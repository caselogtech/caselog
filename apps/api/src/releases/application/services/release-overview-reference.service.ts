import { Inject, Injectable } from '@nestjs/common';
import { ResourceNotFoundError } from '../../../common/errors/domain.error';
import { ReleaseRepository } from '../../infrastructure/repositories/release.repository';
import type {
  ReleaseOverviewReference,
  ReleaseOverviewReferenceQuery,
} from '../ports/release-overview-reference';

@Injectable()
export class ReleaseOverviewReferenceService {
  constructor(@Inject(ReleaseRepository) private readonly releases: ReleaseRepository) {}

  async list(
    organizationId: string,
    projectSlug: string,
    query: ReleaseOverviewReferenceQuery,
  ): Promise<ReleaseOverviewReference> {
    const result = await this.releases.listOverview(organizationId, projectSlug, query);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    return result.value;
  }
}
