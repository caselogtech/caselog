import { Inject, Injectable } from '@nestjs/common';
import { ResourceNotFoundError } from '../../../common/errors/domain.error';
import type { ReleaseCandidateReference } from '../ports/release-candidate-reference';
import { ReleaseCandidateReferenceRepository } from '../../infrastructure/repositories/release-candidate-reference.repository';

@Injectable()
export class ReleaseCandidateReferenceService {
  constructor(
    @Inject(ReleaseCandidateReferenceRepository)
    private readonly references: ReleaseCandidateReferenceRepository,
  ) {}

  async resolve(organizationId: string, candidateId: string): Promise<ReleaseCandidateReference> {
    const reference = await this.references.find(organizationId, candidateId);
    if (!reference) throw new ResourceNotFoundError('release_candidate');
    return reference;
  }
}
