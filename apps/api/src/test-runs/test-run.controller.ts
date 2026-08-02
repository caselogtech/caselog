import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type {
  CreateTestRunResponse,
  OrganizationAccessPrincipal,
  TestRunListResponse,
} from '@caselog/schemas';
import { OrganizationAuthGuard } from '../auth/organization-auth.guard';
import { CurrentOrganization } from '../auth/organization-principal.decorator';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import { CreateTestRunRequestDto, TestRunListParamsDto, TestRunListQueryDto } from './test-run.dto';
import { TestRunService } from './test-run.service';

@Controller('projects/:projectSlug/runs')
@UseGuards(OrganizationAuthGuard)
export class TestRunController {
  constructor(@Inject(TestRunService) private readonly runs: TestRunService) {}

  @Get()
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunListParamsDto,
    @Query() query: TestRunListQueryDto,
  ): Promise<TestRunListResponse> {
    return this.runs.list(principal.organizationId, params.projectSlug, query);
  }

  @Post()
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunListParamsDto,
    @Body() request: CreateTestRunRequestDto,
  ): Promise<CreateTestRunResponse> {
    return this.runs.create(principal, params.projectSlug, request);
  }
}
