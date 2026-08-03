import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import type { OrganizationAccessPrincipal, RunProgressResponse } from '@caselog/schemas';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  RequireApiTokenScopes,
} from '../../../auth/public-api';
import { ReportingService } from '../../application/services/reporting.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import { RunProgressParamsDto } from '../dto/reporting.dto';

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
}
