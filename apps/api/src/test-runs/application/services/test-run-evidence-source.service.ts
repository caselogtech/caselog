import { Inject, Injectable } from '@nestjs/common';
import { ResourceNotFoundError } from '../../../common/errors/domain.error';
import type { TestRunEvidenceSnapshot } from '../ports/test-run-evidence-source';
import { TestRunEvidenceSourceRepository } from '../../infrastructure/repositories/test-run-evidence-source.repository';

@Injectable()
export class TestRunEvidenceSourceService {
  constructor(
    @Inject(TestRunEvidenceSourceRepository)
    private readonly sources: TestRunEvidenceSourceRepository,
  ) {}

  async resolve(organizationId: string, testRunId: string): Promise<TestRunEvidenceSnapshot> {
    const snapshot = await this.sources.find(organizationId, testRunId);
    if (!snapshot) throw new ResourceNotFoundError('test_run');
    return snapshot;
  }
}
