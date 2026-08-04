import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateTestCaseResponse,
  OrganizationAccessPrincipal,
  TestCaseDetailResponse,
  TestCaseListResponse,
  TestCaseLifecycleResponse,
  TestCaseVersion,
  UpdateTestCaseResponse,
} from '@caselog/schemas';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { CurrentOrganization, OrganizationAuthGuard } from '../../../auth/public-api';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateTestCaseRequestDto,
  RestoreTestCaseVersionRequestDto,
  TestCaseDetailParamsDto,
  TestCaseListParamsDto,
  TestCaseListQueryDto,
  UpdateTestCaseRequestDto,
  TestCaseVersionParamsDto,
} from '../dto/test-case.dto';
import { TestCaseService } from '../../application/services/test-case.service';
import {
  CreateTestCaseResponseDto,
  TestCaseDetailResponseDto,
  TestCaseLifecycleResponseDto,
  TestCaseListResponseDto,
  TestCaseVersionResponseDto,
  UpdateTestCaseResponseDto,
} from '../dto/test-case-response.dto';

@Controller('projects/:projectSlug/cases')
@UseGuards(OrganizationAuthGuard)
@ApiBearerAuth('access-token')
export class TestCaseController {
  constructor(@Inject(TestCaseService) private readonly testCases: TestCaseService) {}

  @Get()
  @ApiOkResponse({ type: TestCaseListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseListParamsDto,
    @Query() query: TestCaseListQueryDto,
  ): Promise<TestCaseListResponse> {
    return this.testCases.list(principal.organizationId, params.projectSlug, query);
  }

  @Post()
  @ApiCreatedResponse({ type: CreateTestCaseResponseDto })
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseListParamsDto,
    @Body() request: CreateTestCaseRequestDto,
  ): Promise<CreateTestCaseResponse> {
    return this.testCases.create(principal, params.projectSlug, request);
  }

  @Get(':caseId')
  @ApiOkResponse({ type: TestCaseDetailResponseDto })
  detail(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseDetailParamsDto,
  ): Promise<TestCaseDetailResponse> {
    return this.testCases.detail(principal.organizationId, params.projectSlug, params.caseId);
  }

  @Put(':caseId')
  @ApiOkResponse({ type: UpdateTestCaseResponseDto })
  update(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseDetailParamsDto,
    @Body() request: UpdateTestCaseRequestDto,
  ): Promise<UpdateTestCaseResponse> {
    return this.testCases.update(principal, params.projectSlug, params.caseId, request);
  }

  @Get(':caseId/versions/:versionId')
  @ApiOkResponse({ type: TestCaseVersionResponseDto })
  version(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseVersionParamsDto,
  ): Promise<TestCaseVersion> {
    return this.testCases.version(
      principal.organizationId,
      params.projectSlug,
      params.caseId,
      params.versionId,
    );
  }

  @Post(':caseId/versions/:versionId/restore')
  @ApiCreatedResponse({ type: UpdateTestCaseResponseDto })
  restore(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseVersionParamsDto,
    @Body() request: RestoreTestCaseVersionRequestDto,
  ): Promise<UpdateTestCaseResponse> {
    return this.testCases.restore(
      principal,
      params.projectSlug,
      params.caseId,
      params.versionId,
      request,
    );
  }

  @Delete(':caseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  archive(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseDetailParamsDto,
  ): Promise<void> {
    return this.testCases.archive(principal, params.projectSlug, params.caseId);
  }

  @Post(':caseId/restore')
  @ApiCreatedResponse({ type: TestCaseLifecycleResponseDto })
  restoreArchived(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseDetailParamsDto,
  ): Promise<TestCaseLifecycleResponse> {
    return this.testCases.restoreArchived(principal, params.projectSlug, params.caseId);
  }

  @Post(':caseId/duplicate')
  @ApiCreatedResponse({ type: CreateTestCaseResponseDto })
  duplicate(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseDetailParamsDto,
  ): Promise<CreateTestCaseResponse> {
    return this.testCases.duplicate(principal, params.projectSlug, params.caseId);
  }
}
