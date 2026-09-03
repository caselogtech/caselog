import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  BillingAccountListResponse,
  CreateBillingAccountResponse,
  CreateBillingAccountWorkspaceResponse,
  SessionPrincipal,
} from '@caselog/schemas';
import { CurrentSession, SessionAuthGuard } from '../../../auth/public-api';
import { BillingAccountService } from '../../application/services/billing-account.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  BillingAccountParamsDto,
  CreateBillingAccountHeadersDto,
  CreateBillingAccountRequestDto,
  CreateBillingAccountWorkspaceHeadersDto,
  CreateBillingAccountWorkspaceRequestDto,
} from '../dto/billing-account.dto';
import {
  BillingAccountListResponseDto,
  CreateBillingAccountResponseDto,
  CreateBillingAccountWorkspaceResponseDto,
} from '../dto/billing-account-response.dto';

@Controller('billing/accounts')
@UseGuards(SessionAuthGuard)
@ApiBearerAuth('access-token')
export class BillingAccountController {
  constructor(
    @Inject(BillingAccountService)
    private readonly billingAccounts: BillingAccountService,
  ) {}

  @Get()
  @ApiOkResponse({ type: BillingAccountListResponseDto })
  list(@CurrentSession() principal: SessionPrincipal): Promise<BillingAccountListResponse> {
    return this.billingAccounts.list(principal);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CreateBillingAccountResponseDto })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @CurrentSession() principal: SessionPrincipal,
    @Headers() headers: CreateBillingAccountHeadersDto,
    @Body() request: CreateBillingAccountRequestDto,
  ): Promise<CreateBillingAccountResponse> {
    return this.billingAccounts.create(principal, headers['idempotency-key'], request);
  }

  @Post(':billingAccountId/workspaces')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: CreateBillingAccountWorkspaceResponseDto })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createWorkspace(
    @CurrentSession() principal: SessionPrincipal,
    @Param() params: BillingAccountParamsDto,
    @Headers() headers: CreateBillingAccountWorkspaceHeadersDto,
    @Body() request: CreateBillingAccountWorkspaceRequestDto,
  ): Promise<CreateBillingAccountWorkspaceResponse> {
    return this.billingAccounts.createWorkspace(
      principal,
      params.billingAccountId,
      headers['idempotency-key'],
      request,
    );
  }
}
