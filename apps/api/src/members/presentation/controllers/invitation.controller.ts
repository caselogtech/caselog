import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AcceptWorkspaceInvitationResponse,
  SessionResponse,
  SessionPrincipal,
  WorkspaceInvitationPreview,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import {
  CurrentSession,
  RefreshSessionCookieService,
  SessionAuthGuard,
} from '../../../auth/public-api';
import { InvitationService } from '../../application/services/invitation.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  InvitationTokenParamsDto,
  RegisterInvitationAccountRequestDto,
} from '../dto/invitation.dto';
import {
  AcceptWorkspaceInvitationResponseDto,
  InvitationAccountSessionResponseDto,
  WorkspaceInvitationPreviewDto,
} from '../dto/invitation-response.dto';

@Controller('invitations')
export class InvitationController {
  constructor(
    @Inject(InvitationService) private readonly invitations: InvitationService,
    @Inject(RefreshSessionCookieService)
    private readonly refreshCookie: RefreshSessionCookieService,
  ) {}

  @Get(':token')
  @ApiOkResponse({ type: WorkspaceInvitationPreviewDto })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  preview(@Param() params: InvitationTokenParamsDto): Promise<WorkspaceInvitationPreview> {
    return this.invitations.preview(params.token);
  }

  @Post(':token/register')
  @ApiCreatedResponse({ type: InvitationAccountSessionResponseDto })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Param() params: InvitationTokenParamsDto,
    @Body() request: RegisterInvitationAccountRequestDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponse> {
    return this.refreshCookie.set(
      reply,
      await this.invitations.registerAccount(params.token, request),
    );
  }

  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AcceptWorkspaceInvitationResponseDto })
  @ApiBearerAuth('access-token')
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  accept(
    @CurrentSession() principal: SessionPrincipal,
    @Param() params: InvitationTokenParamsDto,
  ): Promise<AcceptWorkspaceInvitationResponse> {
    return this.invitations.accept(principal, params.token);
  }
}
