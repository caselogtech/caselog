import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  CsvImportPreviewResponse,
  CsvImportResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { CurrentOrganization, OrganizationAuthGuard } from '../../../auth/public-api';
import { CsvImportService } from '../../application/services/csv-import.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CsvImportHeadersDto,
  CsvImportParamsDto,
  CsvImportPreviewResponseDto,
  CsvImportRequestDto,
  CsvImportResponseDto,
} from '../dto/csv-import.dto';

@Controller('projects/:projectSlug/imports/csv')
@UseGuards(OrganizationAuthGuard)
@ApiBearerAuth('access-token')
export class CsvImportController {
  constructor(@Inject(CsvImportService) private readonly csvImports: CsvImportService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CsvImportPreviewResponseDto })
  preview(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CsvImportParamsDto,
    @Body() request: CsvImportRequestDto,
  ): Promise<CsvImportPreviewResponse> {
    return this.csvImports.preview(principal, params.projectSlug, request);
  }

  @Post('commit')
  @ApiCreatedResponse({ type: CsvImportResponseDto })
  commit(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CsvImportParamsDto,
    @Headers() headers: CsvImportHeadersDto,
    @Body() request: CsvImportRequestDto,
  ): Promise<CsvImportResponse> {
    return this.csvImports.commit(
      principal,
      params.projectSlug,
      headers['idempotency-key'],
      request,
    );
  }
}
