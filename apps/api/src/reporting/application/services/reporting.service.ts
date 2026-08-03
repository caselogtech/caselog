import { Inject, Injectable } from '@nestjs/common';
import { runProgressResponseSchema, type RunProgressResponse } from '@caselog/schemas';
import { ResourceNotFoundError } from '../../../common/errors/domain.error';
import { buildRunProgress } from '../../domain/calculations/run-progress';
import { ReportingRepository } from '../../infrastructure/repositories/reporting.repository';

@Injectable()
export class ReportingService {
  constructor(@Inject(ReportingRepository) private readonly reports: ReportingRepository) {}

  async runProgress(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<RunProgressResponse> {
    const result = await this.reports.runProgress(organizationId, projectSlug, runId);
    if (result.kind === 'project_not_found') {
      throw new ResourceNotFoundError('project');
    }
    if (result.kind === 'run_not_found') {
      throw new ResourceNotFoundError('test_run');
    }
    return runProgressResponseSchema.parse(buildRunProgress(result.value));
  }
}
