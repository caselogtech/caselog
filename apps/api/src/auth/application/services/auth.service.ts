import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  authUserSchema,
  emailVerificationResponseSchema,
  messageResponseSchema,
  type AuthUser,
  type EmailVerificationResponse,
  type ForgotPasswordRequest,
  type LoginRequest,
  type MessageResponse,
  type OrganizationTokenResponse,
  type RegisterRequest,
  type ResetPasswordRequest,
  type SessionPrincipal,
  type SessionResponse,
} from '@caselog/schemas';
import {
  AuthenticationFailedError,
  InvalidAccountTokenError,
  InvalidSessionError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { MailService } from '../../../core/mail/application/services/mail.service';
import { createAccountToken, hashAccountToken } from '../../domain/models/account-token';
import { AccountTokenRepository } from '../../infrastructure/repositories/account-token.repository';
import { AUTH_CONFIG, type AuthConfig } from '../../infrastructure/config/auth.config';
import { AuthTokenService } from './auth-token.service';
import {
  IdentityRepository,
  type Identity,
} from '../../infrastructure/repositories/identity.repository';
import { PasswordService } from './password.service';
import { createRefreshToken, hashRefreshToken } from '../../domain/models/refresh-token';
import { TenantAccessRepository } from '../../infrastructure/repositories/tenant-access.repository';

export type SessionResult = {
  response: SessionResponse;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(IdentityRepository) private readonly identities: IdentityRepository,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(AuthTokenService) private readonly tokens: AuthTokenService,
    @Inject(TenantAccessRepository) private readonly tenantAccess: TenantAccessRepository,
    @Inject(AccountTokenRepository) private readonly accountTokens: AccountTokenRepository,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async register(request: RegisterRequest): Promise<SessionResult> {
    const passwordHash = await this.passwords.hash(request.password);
    const identity = await this.identities.createIdentity(
      request.email,
      request.displayName,
      passwordHash,
    );

    if (!identity) {
      throw new ResourceConflictError(
        'email_already_registered',
        'An account with this email already exists',
      );
    }

    await this.sendEmailVerificationSafely(identity);
    return this.startSession(identity);
  }

  async login(request: LoginRequest): Promise<SessionResult> {
    const identity = await this.identities.findByEmail(request.email);
    const matches = await this.passwords.matches(identity?.passwordHash, request.password);

    if (!identity || !matches) {
      throw new AuthenticationFailedError();
    }

    return this.startSession(identity);
  }

  async refresh(refreshToken: string | undefined): Promise<SessionResult> {
    if (!refreshToken) {
      throw new InvalidSessionError();
    }

    const nextRefreshToken = createRefreshToken();
    const rotated = await this.identities.rotateSession(
      hashRefreshToken(refreshToken),
      hashRefreshToken(nextRefreshToken),
      this.refreshExpiresAt(),
    );

    if (rotated.kind !== 'rotated') {
      throw new InvalidSessionError();
    }

    return {
      response: await this.tokens.issueSession(rotated.identity),
      refreshToken: nextRefreshToken,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      await this.identities.revokeByRefreshTokenHash(hashRefreshToken(refreshToken));
    }
  }

  async me(principal: SessionPrincipal): Promise<AuthUser> {
    const identity = await this.identities.findById(principal.sub);
    if (!identity) {
      throw new InvalidSessionError();
    }
    return authUserSchema.parse(identity);
  }

  async resendEmailVerification(principal: SessionPrincipal): Promise<MessageResponse> {
    const identity = await this.identities.findById(principal.sub);
    if (identity && !identity.emailVerified) {
      await this.sendEmailVerificationSafely(identity);
    }
    return messageResponseSchema.parse({
      message: 'If verification is required, a new email has been sent.',
    });
  }

  async verifyEmail(token: string): Promise<EmailVerificationResponse> {
    const consumed = await this.accountTokens.consumeEmailVerification(hashAccountToken(token));
    if (!consumed) {
      throw new InvalidAccountTokenError();
    }
    return emailVerificationResponseSchema.parse({ verified: true });
  }

  async forgotPassword(request: ForgotPasswordRequest): Promise<MessageResponse> {
    const identity = await this.identities.findByEmail(request.email);
    if (identity) {
      await this.sendPasswordResetSafely(identity);
    }
    return messageResponseSchema.parse({
      message: 'If an account exists for this email, a reset link has been sent.',
    });
  }

  async resetPassword(request: ResetPasswordRequest): Promise<MessageResponse> {
    const passwordHash = await this.passwords.hash(request.password);
    const consumed = await this.accountTokens.consumePasswordReset(
      hashAccountToken(request.token),
      passwordHash,
    );
    if (!consumed) {
      throw new InvalidAccountTokenError();
    }
    return messageResponseSchema.parse({
      message: 'Your password has been reset. Sign in with your new password.',
    });
  }

  async organizationToken(
    principal: SessionPrincipal,
    slug: string,
  ): Promise<OrganizationTokenResponse> {
    const access = await this.tenantAccess.findBySlug(principal.sub, slug);
    if (!access) {
      throw new ResourceNotFoundError('organization');
    }
    return this.tokens.issueOrganization(principal, access);
  }

  private async startSession(identity: Identity): Promise<SessionResult> {
    const refreshToken = createRefreshToken();
    const sessionIdentity = await this.identities.createSession(
      identity,
      hashRefreshToken(refreshToken),
      this.refreshExpiresAt(),
    );
    return {
      response: await this.tokens.issueSession(sessionIdentity),
      refreshToken,
    };
  }

  private refreshExpiresAt(): Date {
    return new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000);
  }

  private async sendEmailVerificationSafely(identity: Identity): Promise<void> {
    const token = createAccountToken();
    await this.accountTokens.issue(
      identity.id,
      'EMAIL_VERIFICATION',
      hashAccountToken(token),
      new Date(Date.now() + this.config.emailVerificationTtlHours * 3_600_000),
    );

    try {
      const link = new URL('/auth/verify', this.config.webBaseUrl);
      link.searchParams.set('token', token);
      await this.mail.sendEmailVerification(identity.email, identity.displayName, link.toString());
    } catch {
      this.logger.warn({ event: 'auth.email_verification.delivery_failed' });
    }
  }

  private async sendPasswordResetSafely(identity: Identity): Promise<void> {
    const token = createAccountToken();
    await this.accountTokens.issue(
      identity.id,
      'PASSWORD_RESET',
      hashAccountToken(token),
      new Date(Date.now() + this.config.passwordResetTtlMinutes * 60_000),
    );

    try {
      const link = new URL('/auth/reset', this.config.webBaseUrl);
      link.searchParams.set('token', token);
      await this.mail.sendPasswordReset(identity.email, identity.displayName, link.toString());
    } catch {
      this.logger.warn({ event: 'auth.password_reset.delivery_failed' });
    }
  }
}
