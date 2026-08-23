import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type { OrganizationAccessPrincipal, ResultIngestionListResponse } from '@caselog/schemas';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireApiTokenScopes,
} from '../../../auth/public-api';
import { ResultIngestionService } from '../../application/services/result-ingestion.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  ResultIngestionListParamsDto,
  ResultIngestionListQueryDto,
  ResultIngestionListResponseDto,
} from '../dto/result-ingestion.dto';

@Controller('projects/:projectSlug/automation/imports')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class ResultIngestionController {
  constructor(
    @Inject(ResultIngestionService)
    private readonly resultIngestions: ResultIngestionService,
  ) {}

  @Get()
  @RequireApiTokenScopes('runs:read')
  @ApiOkResponse({ type: ResultIngestionListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ResultIngestionListParamsDto,
    @Query() query: ResultIngestionListQueryDto,
  ): Promise<ResultIngestionListResponse> {
    return this.resultIngestions.list(principal, params.projectSlug, query);
  }
}
