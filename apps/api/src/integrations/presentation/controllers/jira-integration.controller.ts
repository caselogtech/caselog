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
  Put,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateJiraDataCenterConnectionResponse,
  IntegrationConnectionListResponse,
  IssueTrackerIdentity,
  JiraIssueSearchResponse,
  JiraProjectListResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { CurrentOrganization, OrganizationAuthGuard } from '../../../auth/public-api';
import { IntegrationConnectionService } from '../../application/services/integration-connection.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateIntegrationConnectionHeadersDto,
  CreateJiraDataCenterConnectionRequestDto,
  CreateJiraDataCenterConnectionResponseDto,
  IntegrationConnectionListResponseDto,
  IntegrationConnectionParamsDto,
  IssueTrackerIdentityDto,
  JiraIssueSearchRequestDto,
  JiraIssueSearchResponseDto,
  JiraProjectListResponseDto,
  UpdateJiraDataCenterCredentialsRequestDto,
} from '../dto/integration.dto';

@Controller('integrations/jira')
@UseGuards(OrganizationAuthGuard)
@ApiBearerAuth('access-token')
export class JiraIntegrationController {
  constructor(
    @Inject(IntegrationConnectionService)
    private readonly integrations: IntegrationConnectionService,
  ) {}

  @Post('connections')
  @ApiCreatedResponse({ type: CreateJiraDataCenterConnectionResponseDto })
  createConnection(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Headers() headers: CreateIntegrationConnectionHeadersDto,
    @Body() request: CreateJiraDataCenterConnectionRequestDto,
  ): Promise<CreateJiraDataCenterConnectionResponse> {
    return this.integrations.createJiraDataCenter(principal, headers['idempotency-key'], request);
  }

  @Get('connections')
  @ApiOkResponse({ type: IntegrationConnectionListResponseDto })
  listConnections(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
  ): Promise<IntegrationConnectionListResponse> {
    return this.integrations.list(principal);
  }

  @Put('connections/:connectionId/credentials')
  @ApiOkResponse({ type: CreateJiraDataCenterConnectionResponseDto })
  updateCredentials(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: IntegrationConnectionParamsDto,
    @Body() request: UpdateJiraDataCenterCredentialsRequestDto,
  ): Promise<CreateJiraDataCenterConnectionResponse> {
    return this.integrations.updateCredentials(principal, params.connectionId, request);
  }

  @Post('connections/:connectionId/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: IssueTrackerIdentityDto })
  verifyConnection(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: IntegrationConnectionParamsDto,
  ): Promise<IssueTrackerIdentity> {
    return this.integrations.verify(principal, params.connectionId);
  }

  @Get('connections/:connectionId/projects')
  @ApiOkResponse({ type: JiraProjectListResponseDto })
  listProjects(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: IntegrationConnectionParamsDto,
  ): Promise<JiraProjectListResponse> {
    return this.integrations.listProjects(principal, params.connectionId);
  }

  @Post('connections/:connectionId/issues/search')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: JiraIssueSearchResponseDto })
  searchIssues(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: IntegrationConnectionParamsDto,
    @Body() request: JiraIssueSearchRequestDto,
  ): Promise<JiraIssueSearchResponse> {
    return this.integrations.searchIssues(principal, params.connectionId, request);
  }

  @Delete('connections/:connectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  deleteConnection(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: IntegrationConnectionParamsDto,
  ): Promise<void> {
    return this.integrations.delete(principal, params.connectionId);
  }
}
