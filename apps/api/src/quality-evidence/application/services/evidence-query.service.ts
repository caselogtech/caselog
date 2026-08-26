import { Inject, Injectable } from '@nestjs/common';
import {
  evidenceListResponseSchema,
  type EvidenceListQuery,
  type EvidenceListResponse,
} from '@caselog/schemas/evidence';
import type { OrganizationAccessPrincipal } from '@caselog/schemas';
import { ResourceNotFoundError } from '../../../common/errors/domain.error';
import { EvidenceQueryRepository } from '../../infrastructure/repositories/evidence-query.repository';

@Injectable()
export class EvidenceQueryService {
  constructor(
    @Inject(EvidenceQueryRepository) private readonly evidence: EvidenceQueryRepository,
  ) {}

  async list(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    query: EvidenceListQuery,
  ): Promise<EvidenceListResponse> {
    const result = await this.evidence.list(principal.organizationId, projectSlug, query);
    if (result.kind !== 'found') {
      const resource = {
        project_not_found: 'project',
        candidate_not_found: 'release_candidate',
        cursor_not_found: 'evidence_cursor',
      }[result.kind];
      throw new ResourceNotFoundError(resource);
    }
    return evidenceListResponseSchema.parse(result.value);
  }
}
