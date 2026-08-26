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
  EvidenceIngestResponse,
  EvidenceListResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireApiTokenScopes,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { EvidenceIngestionService } from '../../application/services/evidence-ingestion.service';
import { EvidenceQueryService } from '../../application/services/evidence-query.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  EvidenceIngestHeadersDto,
  EvidenceIngestRequestDto,
  EvidenceListQueryDto,
  EvidenceProjectParamsDto,
} from '../dto/evidence.dto';
import { EvidenceIngestResponseDto, EvidenceListResponseDto } from '../dto/evidence-response.dto';

@Controller('projects/:projectSlug/evidence')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class EvidenceController {
  constructor(
    @Inject(EvidenceQueryService) private readonly evidence: EvidenceQueryService,
    @Inject(EvidenceIngestionService) private readonly ingestion: EvidenceIngestionService,
  ) {}

  @Get()
  @ApiOkResponse({ type: EvidenceListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: EvidenceProjectParamsDto,
    @Query() query: EvidenceListQueryDto,
  ): Promise<EvidenceListResponse> {
    return this.evidence.list(principal, params.projectSlug, query);
  }

  @Post()
  @RequireOrganizationAccess('lead')
  @RequireApiTokenScopes('evidence:write')
  @ApiCreatedResponse({ type: EvidenceIngestResponseDto })
  ingest(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: EvidenceProjectParamsDto,
    @Headers() headers: EvidenceIngestHeadersDto,
    @Body() request: EvidenceIngestRequestDto,
  ): Promise<EvidenceIngestResponse> {
    return this.ingestion.ingest(
      principal,
      params.projectSlug,
      headers['idempotency-key'],
      request,
    );
  }
}
