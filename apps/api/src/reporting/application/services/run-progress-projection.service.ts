import { Inject, Injectable } from '@nestjs/common';
import { runProgressResponseSchema, type RunProgressResponse } from '@caselog/schemas';
import { buildRunProgress } from '../../domain/calculations/run-progress';
import { RunProgressProjectionRepository } from '../../infrastructure/repositories/run-progress-projection.repository';
import { RunProgressRepository } from '../../infrastructure/repositories/run-progress.repository';

@Injectable()
export class RunProgressProjectionService {
  constructor(
    @Inject(RunProgressRepository) private readonly reports: RunProgressRepository,
    @Inject(RunProgressProjectionRepository)
    private readonly projections: RunProgressProjectionRepository,
  ) {}

  async refresh(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<RunProgressResponse | null> {
    const result = await this.reports.find(organizationId, projectSlug, runId);
    if (result.kind !== 'found') return null;

    const response = runProgressResponseSchema.parse(buildRunProgress(result.value.source));
    await this.projections.save(organizationId, runId, result.value.revision, response);
    return response;
  }
}
