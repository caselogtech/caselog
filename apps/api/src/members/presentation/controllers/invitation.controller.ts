import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AcceptWorkspaceInvitationResponse,
  SessionPrincipal,
  WorkspaceInvitationPreview,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { CurrentSession, SessionAuthGuard } from '../../../auth/public-api';
import { InvitationService } from '../../application/services/invitation.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import { InvitationTokenParamsDto } from '../dto/invitation.dto';
import {
  AcceptWorkspaceInvitationResponseDto,
  WorkspaceInvitationPreviewDto,
} from '../dto/invitation-response.dto';

@Controller('invitations')
export class InvitationController {
  constructor(@Inject(InvitationService) private readonly invitations: InvitationService) {}

  @Get(':token')
  @ApiOkResponse({ type: WorkspaceInvitationPreviewDto })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  preview(@Param() params: InvitationTokenParamsDto): Promise<WorkspaceInvitationPreview> {
    return this.invitations.preview(params.token);
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
