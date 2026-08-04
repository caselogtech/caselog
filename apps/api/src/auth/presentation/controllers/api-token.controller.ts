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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { CurrentOrganization } from '../decorators/organization-principal.decorator';
import { OrganizationAuthGuard } from '../guards/organization-auth.guard';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import { ApiTokenParamsDto, CreateApiTokenRequestDto } from '../dto/api-token.dto';
import { ApiTokenService } from '../../application/services/api-token.service';
import { ApiTokenListResponseDto, CreateApiTokenResponseDto } from '../dto/auth-response.dto';

@Controller('api-tokens')
@UseGuards(OrganizationAuthGuard)
@ApiBearerAuth('access-token')
export class ApiTokenController {
  constructor(@Inject(ApiTokenService) private readonly apiTokens: ApiTokenService) {}

  @Get()
  @ApiOkResponse({ type: ApiTokenListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
  ): Promise<ApiTokenListResponse> {
    return this.apiTokens.list(principal);
  }

  @Post()
  @ApiCreatedResponse({ type: CreateApiTokenResponseDto })
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Body() request: CreateApiTokenRequestDto,
  ): Promise<CreateApiTokenResponse> {
    return this.apiTokens.create(principal, request);
  }

  @Delete(':tokenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  revoke(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ApiTokenParamsDto,
  ): Promise<void> {
    return this.apiTokens.revoke(principal, params.tokenId);
  }
}
