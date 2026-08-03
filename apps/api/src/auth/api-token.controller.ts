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
  UseGuards,
} from '@nestjs/common';
import type {
  ApiTokenListResponse,
  CreateApiTokenResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { CurrentOrganization } from './organization-principal.decorator';
import { OrganizationAuthGuard } from './organization-auth.guard';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import { ApiTokenParamsDto, CreateApiTokenRequestDto } from './api-token.dto';
import { ApiTokenService } from './api-token.service';

@Controller('api-tokens')
@UseGuards(OrganizationAuthGuard)
export class ApiTokenController {
  constructor(@Inject(ApiTokenService) private readonly apiTokens: ApiTokenService) {}

  @Get()
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
  ): Promise<ApiTokenListResponse> {
    return this.apiTokens.list(principal);
  }

  @Post()
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Body() request: CreateApiTokenRequestDto,
  ): Promise<CreateApiTokenResponse> {
    return this.apiTokens.create(principal, request);
  }

  @Delete(':tokenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ApiTokenParamsDto,
  ): Promise<void> {
    return this.apiTokens.revoke(principal, params.tokenId);
  }
}
