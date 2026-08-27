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
  ReadinessWaiverListResponse,
  ReadinessWaiverResponse,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { ReadinessWaiverService } from '../../application/services/readiness-waiver.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateReadinessWaiverRequestDto,
  ReadinessWaiverDecisionParamsDto,
  ReadinessWaiverListQueryDto,
  ReadinessWaiverParamsDto,
  ReadinessWaiverWriteHeadersDto,
  RevokeReadinessWaiverRequestDto,
} from '../dto/readiness-waiver.dto';
import {
  ReadinessWaiverListResponseDto,
  ReadinessWaiverResponseDto,
} from '../dto/readiness-waiver-response.dto';

@Controller('projects/:projectSlug/readiness-decisions/:decisionId/waivers')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class ReadinessWaiverController {
  constructor(
    @Inject(ReadinessWaiverService)
    private readonly waivers: ReadinessWaiverService,
  ) {}

  @Post()
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: ReadinessWaiverResponseDto })
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReadinessWaiverDecisionParamsDto,
    @Headers() headers: ReadinessWaiverWriteHeadersDto,
    @Body() request: CreateReadinessWaiverRequestDto,
  ): Promise<ReadinessWaiverResponse> {
    return this.waivers.create(
      principal,
      params.projectSlug,
      params.decisionId,
      headers['idempotency-key'],
      request,
    );
  }

  @Get()
  @ApiOkResponse({ type: ReadinessWaiverListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReadinessWaiverDecisionParamsDto,
    @Query() query: ReadinessWaiverListQueryDto,
  ): Promise<ReadinessWaiverListResponse> {
    return this.waivers.list(principal, params.projectSlug, params.decisionId, query);
  }

  @Post(':waiverId/revocation')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: ReadinessWaiverResponseDto })
  revoke(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReadinessWaiverParamsDto,
    @Headers() headers: ReadinessWaiverWriteHeadersDto,
    @Body() request: RevokeReadinessWaiverRequestDto,
  ): Promise<ReadinessWaiverResponse> {
    return this.waivers.revoke(
      principal,
      params.projectSlug,
      params.decisionId,
      params.waiverId,
      headers['idempotency-key'],
      request,
    );
  }
}
