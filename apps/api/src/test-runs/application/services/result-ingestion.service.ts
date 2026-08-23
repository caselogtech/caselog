import { Inject, Injectable } from '@nestjs/common';
import {
  resultIngestionListResponseSchema,
  type OrganizationAccessPrincipal,
  type ResultIngestionListQuery,
  type ResultIngestionListResponse,
} from '@caselog/schemas';
import { ResourceNotFoundError } from '../../../common/errors/domain.error';
import { ResultIngestionRepository } from '../../infrastructure/repositories/result-ingestion.repository';

@Injectable()
export class ResultIngestionService {
  constructor(
    @Inject(ResultIngestionRepository)
    private readonly resultIngestions: ResultIngestionRepository,
  ) {}

  async list(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    query: ResultIngestionListQuery,
  ): Promise<ResultIngestionListResponse> {
    const result = await this.resultIngestions.list(principal.organizationId, projectSlug, query);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'cursor_not_found') {
      throw new ResourceNotFoundError('result_ingestion_cursor');
    }
    return resultIngestionListResponseSchema.parse(result.value);
  }
}
