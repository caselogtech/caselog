import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  OrganizationAccessPrincipal,
  ReadinessPolicyListResponse,
  ReadinessPolicyResponse,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { ReadinessPolicyService } from '../../application/services/readiness-policy.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateReadinessPolicyRequestDto,
  CreateReadinessPolicyVersionRequestDto,
  ReadinessPolicyListQueryDto,
  ReadinessPolicyParamsDto,
  ReadinessPolicyProjectParamsDto,
  ReadinessPolicyWriteHeadersDto,
} from '../dto/readiness-policy.dto';
import {
  ReadinessPolicyListResponseDto,
  ReadinessPolicyResponseDto,
} from '../dto/readiness-policy-response.dto';

@Controller('projects/:projectSlug/release-policies')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class ReadinessPolicyController {
  constructor(
    @Inject(ReadinessPolicyService)
    private readonly policies: ReadinessPolicyService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ReadinessPolicyListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReadinessPolicyProjectParamsDto,
    @Query() query: ReadinessPolicyListQueryDto,
  ): Promise<ReadinessPolicyListResponse> {
    return this.policies.list(principal, params.projectSlug, query);
  }

  @Post()
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: ReadinessPolicyResponseDto })
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReadinessPolicyProjectParamsDto,
    @Headers() headers: ReadinessPolicyWriteHeadersDto,
    @Body() request: CreateReadinessPolicyRequestDto,
  ): Promise<ReadinessPolicyResponse> {
    return this.policies.create(principal, params.projectSlug, headers['idempotency-key'], request);
  }

  @Get(':policyId')
  @ApiOkResponse({ type: ReadinessPolicyResponseDto })
  detail(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReadinessPolicyParamsDto,
  ): Promise<ReadinessPolicyResponse> {
    return this.policies.detail(principal, params.projectSlug, params.policyId);
  }

  @Post(':policyId/versions')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: ReadinessPolicyResponseDto })
  createVersion(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReadinessPolicyParamsDto,
    @Headers() headers: ReadinessPolicyWriteHeadersDto,
    @Body() request: CreateReadinessPolicyVersionRequestDto,
  ): Promise<ReadinessPolicyResponse> {
    return this.policies.createVersion(
      principal,
      params.projectSlug,
      params.policyId,
      headers['idempotency-key'],
      request,
    );
  }

  @Post(':policyId/publish')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: ReadinessPolicyResponseDto })
  publish(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReadinessPolicyParamsDto,
    @Headers() headers: ReadinessPolicyWriteHeadersDto,
  ): Promise<ReadinessPolicyResponse> {
    return this.policies.publish(
      principal,
      params.projectSlug,
      params.policyId,
      headers['idempotency-key'],
    );
  }
}
