import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import type {
  AuthUser,
  EmailVerificationResponse,
  MessageResponse,
  OrganizationTokenResponse,
  SessionResponse,
} from '@caselog/schemas';
import type { FastifyReply, FastifyRequest } from 'fastify';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  EmailVerificationRequestDto,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  OrganizationSlugParamDto,
  RegisterRequestDto,
  ResetPasswordRequestDto,
} from '../dto/auth.dto';
import { AuthService } from '../../application/services/auth.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { CurrentSession } from '../decorators/session-principal.decorator';
import type { SessionPrincipal } from '@caselog/schemas';
import {
  AuthUserResponseDto,
  EmailVerificationResponseDto,
  MessageResponseDto,
  OrganizationTokenResponseDto,
  SessionResponseDto,
} from '../dto/auth-response.dto';

import { RefreshSessionCookieService } from '../../infrastructure/cookies/refresh-session-cookie.service';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(RefreshSessionCookieService)
    private readonly refreshCookie: RefreshSessionCookieService,
  ) {}

  @Post('register')
  @ApiCreatedResponse({ type: SessionResponseDto })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async register(
    @Body() request: RegisterRequestDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponse> {
    return this.refreshCookie.set(reply, await this.auth.register(request));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SessionResponseDto })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() request: LoginRequestDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponse> {
    return this.refreshCookie.set(reply, await this.auth.login(request));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiCookieAuth('refresh-cookie')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponse> {
    return this.refreshCookie.set(reply, await this.auth.refresh(this.refreshCookie.read(request)));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(this.refreshCookie.read(request));
    this.refreshCookie.clear(reply);
  }

  @Get('me')
  @ApiOkResponse({ type: AuthUserResponseDto })
  @ApiBearerAuth('access-token')
  @UseGuards(SessionAuthGuard)
  me(@CurrentSession() principal: SessionPrincipal): Promise<AuthUser> {
    return this.auth.me(principal);
  }

  @Post('email/verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: MessageResponseDto })
  @ApiBearerAuth('access-token')
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendEmailVerification(@CurrentSession() principal: SessionPrincipal): Promise<MessageResponse> {
    return this.auth.resendEmailVerification(principal);
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: EmailVerificationResponseDto })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Body() request: EmailVerificationRequestDto): Promise<EmailVerificationResponse> {
    return this.auth.verifyEmail(request.token);
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: MessageResponseDto })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(@Body() request: ForgotPasswordRequestDto): Promise<MessageResponse> {
    return this.auth.forgotPassword(request);
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MessageResponseDto })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resetPassword(@Body() request: ResetPasswordRequestDto): Promise<MessageResponse> {
    return this.auth.resetPassword(request);
  }

  @Post('organizations/:slug/token')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OrganizationTokenResponseDto })
  @ApiBearerAuth('access-token')
  @UseGuards(SessionAuthGuard)
  organizationToken(
    @CurrentSession() principal: SessionPrincipal,
    @Param() params: OrganizationSlugParamDto,
  ): Promise<OrganizationTokenResponse> {
    return this.auth.organizationToken(principal, params.slug);
  }
}
