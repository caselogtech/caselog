import { Inject, Injectable } from '@nestjs/common';
import { ResourceNotFoundError } from '../../../common/errors/domain.error';
import type { TestRunReference } from '../ports/test-run-reference';
import { TestRunReferenceRepository } from '../../infrastructure/repositories/test-run-reference.repository';

@Injectable()
export class TestRunReferenceService {
  constructor(
    @Inject(TestRunReferenceRepository)
    private readonly references: TestRunReferenceRepository,
  ) {}

  async resolve(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<TestRunReference> {
    const reference = await this.references.find(organizationId, projectSlug, runId);
    if (!reference) throw new ResourceNotFoundError('test_run');
    return reference;
  }
}
