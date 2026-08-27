import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type { OrganizationAccessPrincipal, ReleaseReadinessListResponse } from '@caselog/schemas';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
} from '../../../auth/public-api';
import { ReleaseReadinessSummaryService } from '../../application/services/release-readiness-summary.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import { ReadinessPolicyProjectParamsDto } from '../dto/readiness-policy.dto';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  ReleaseReadinessListQueryDto,
  ReleaseReadinessListResponseDto,
} from '../dto/release-readiness-summary.dto';

@Controller('projects/:projectSlug/release-readiness')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class ReleaseReadinessSummaryController {
  constructor(
    @Inject(ReleaseReadinessSummaryService)
    private readonly summaries: ReleaseReadinessSummaryService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ReleaseReadinessListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReadinessPolicyProjectParamsDto,
    @Query() query: ReleaseReadinessListQueryDto,
  ): Promise<ReleaseReadinessListResponse> {
    return this.summaries.list(principal, params.projectSlug, query);
  }
}
