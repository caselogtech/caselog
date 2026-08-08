import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateJiraDefectResponse,
  IssueLinkListResponse,
  IssueLinkResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
} from '../../../auth/public-api';
import { DefectCreationService } from '../../application/services/defect-creation.service';
import { IssueLinkService } from '../../application/services/issue-link.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CaseIssueLinkItemParamsDto,
  CaseIssueLinkParamsDto,
  CreateDefectHeadersDto,
  CreateJiraDefectRequestDto,
  CreateJiraDefectResponseDto,
  IssueLinkListResponseDto,
  IssueLinkResponseDto,
  LinkJiraIssueRequestDto,
  ResultIssueLinkItemParamsDto,
  ResultIssueLinkParamsDto,
} from '../dto/integration.dto';

@Controller('projects/:projectSlug/cases/:caseId/integrations/jira/issues')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class CaseIssueLinkController {
  constructor(@Inject(IssueLinkService) private readonly issueLinks: IssueLinkService) {}

  @Get()
  @ApiOkResponse({ type: IssueLinkListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CaseIssueLinkParamsDto,
  ): Promise<IssueLinkListResponse> {
    return this.issueLinks.listCaseIssues(principal, params.projectSlug, params.caseId);
  }

  @Post()
  @ApiCreatedResponse({ type: IssueLinkResponseDto })
  link(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CaseIssueLinkParamsDto,
    @Body() request: LinkJiraIssueRequestDto,
  ): Promise<IssueLinkResponse> {
    return this.issueLinks.linkCaseIssue(principal, params.projectSlug, params.caseId, request);
  }

  @Delete(':linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  unlink(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CaseIssueLinkItemParamsDto,
  ): Promise<void> {
    return this.issueLinks.unlinkCaseIssue(
      principal,
      params.projectSlug,
      params.caseId,
      params.linkId,
    );
  }
}

@Controller(
  'projects/:projectSlug/runs/:runId/items/:itemId/results/:resultId/integrations/jira/issues',
)
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class ResultIssueLinkController {
  constructor(
    @Inject(IssueLinkService) private readonly issueLinks: IssueLinkService,
    @Inject(DefectCreationService) private readonly defects: DefectCreationService,
  ) {}

  @Get()
  @ApiOkResponse({ type: IssueLinkListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ResultIssueLinkParamsDto,
  ): Promise<IssueLinkListResponse> {
    return this.issueLinks.listResultIssues(principal, params);
  }

  @Post()
  @ApiCreatedResponse({ type: IssueLinkResponseDto })
  link(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ResultIssueLinkParamsDto,
    @Body() request: LinkJiraIssueRequestDto,
  ): Promise<IssueLinkResponse> {
    return this.issueLinks.linkResultIssue(principal, params, request);
  }

  @Post('defects')
  @ApiCreatedResponse({ type: CreateJiraDefectResponseDto })
  createDefect(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ResultIssueLinkParamsDto,
    @Headers() headers: CreateDefectHeadersDto,
    @Body() request: CreateJiraDefectRequestDto,
  ): Promise<CreateJiraDefectResponse> {
    return this.defects.create(principal, params, headers['idempotency-key'], request);
  }

  @Delete(':linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  unlink(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ResultIssueLinkItemParamsDto,
  ): Promise<void> {
    return this.issueLinks.unlinkResultIssue(principal, params, params.linkId);
  }
}
