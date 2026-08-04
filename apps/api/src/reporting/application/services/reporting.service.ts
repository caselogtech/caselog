import { Inject, Injectable } from '@nestjs/common';
import {
  caseExecutionHistoryResponseSchema,
  runProgressResponseSchema,
  type CaseExecutionHistoryQuery,
  type CaseExecutionHistoryResponse,
  type RunProgressResponse,
} from '@caselog/schemas';
import { ResourceNotFoundError } from '../../../common/errors/domain.error';
import { CaseExecutionHistoryRepository } from '../../infrastructure/repositories/case-execution-history.repository';
import { RunProgressProjectionRepository } from '../../infrastructure/repositories/run-progress-projection.repository';
import { RunProgressProjectionService } from './run-progress-projection.service';

@Injectable()
export class ReportingService {
  constructor(
    @Inject(RunProgressProjectionRepository)
    private readonly runProgressReports: RunProgressProjectionRepository,
    @Inject(RunProgressProjectionService)
    private readonly runProgressProjections: RunProgressProjectionService,
    @Inject(CaseExecutionHistoryRepository)
    private readonly caseHistoryReports: CaseExecutionHistoryRepository,
  ) {}

  async runProgress(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<RunProgressResponse> {
    const result = await this.runProgressReports.find(organizationId, projectSlug, runId);
    if (result.kind === 'project_not_found') {
      throw new ResourceNotFoundError('project');
    }
    if (result.kind === 'run_not_found') {
      throw new ResourceNotFoundError('test_run');
    }
    const snapshot = result.value.snapshot;
    if (snapshot && snapshot.revision === result.value.currentRevision) {
      return runProgressResponseSchema.parse(snapshot.response);
    }

    const refreshed = await this.runProgressProjections.refresh(organizationId, projectSlug, runId);
    if (!refreshed) throw new ResourceNotFoundError('test_run');
    return refreshed;
  }

  async caseExecutionHistory(
    organizationId: string,
    projectSlug: string,
    caseId: string,
    query: CaseExecutionHistoryQuery,
  ): Promise<CaseExecutionHistoryResponse> {
    const result = await this.caseHistoryReports.find(organizationId, projectSlug, caseId, query);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'case_not_found') throw new ResourceNotFoundError('test_case');
    if (result.kind === 'history_cursor_not_found') {
      throw new ResourceNotFoundError('case_history_cursor');
    }
    if (result.kind !== 'found') throw new ResourceNotFoundError('case_history');
    return caseExecutionHistoryResponseSchema.parse(result.value);
  }
}
