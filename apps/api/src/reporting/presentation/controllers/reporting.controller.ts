import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type {
  CaseExecutionHistoryResponse,
  OrganizationAccessPrincipal,
  RunProgressResponse,
} from '@caselog/schemas';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  RequireApiTokenScopes,
} from '../../../auth/public-api';
import { ReportingService } from '../../application/services/reporting.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CaseExecutionHistoryParamsDto,
  CaseExecutionHistoryQueryDto,
  RunProgressParamsDto,
} from '../dto/reporting.dto';

@Controller('projects/:projectSlug/reports')
@UseGuards(OrganizationAuthGuard)
export class ReportingController {
  constructor(@Inject(ReportingService) private readonly reports: ReportingService) {}

  @Get('runs/:runId/progress')
  @RequireApiTokenScopes('runs:read')
  runProgress(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: RunProgressParamsDto,
  ): Promise<RunProgressResponse> {
    return this.reports.runProgress(principal.organizationId, params.projectSlug, params.runId);
  }

  @Get('cases/:caseId/history')
  @RequireApiTokenScopes('runs:read')
  caseExecutionHistory(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CaseExecutionHistoryParamsDto,
    @Query() query: CaseExecutionHistoryQueryDto,
  ): Promise<CaseExecutionHistoryResponse> {
    return this.reports.caseExecutionHistory(
      principal.organizationId,
      params.projectSlug,
      params.caseId,
      query,
    );
  }
}
