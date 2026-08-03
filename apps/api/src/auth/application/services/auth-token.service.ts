import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  organizationSessionPrincipalSchema,
  organizationTokenResponseSchema,
  sessionPrincipalSchema,
  sessionResponseSchema,
  type OrganizationTokenResponse,
  type SessionResponse,
} from '@caselog/schemas';
import { AUTH_CONFIG, type AuthConfig } from '../../infrastructure/config/auth.config';
import type {
  Identity,
  SessionIdentity,
} from '../../infrastructure/repositories/identity.repository';
import type { OrganizationAccess } from '../../infrastructure/repositories/tenant-access.repository';

const ISSUER = 'caselog-api';

@Injectable()
export class AuthTokenService {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async issueSession(identity: SessionIdentity): Promise<SessionResponse> {
    const principal = sessionPrincipalSchema.parse({
      sub: identity.id,
      sid: identity.sessionId,
      tokenType: 'session',
    });
    const accessToken = await this.jwt.signAsync(principal, {
      secret: this.config.sessionTokenSecret,
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: 'caselog-web',
      expiresIn: this.config.sessionTokenTtlSeconds,
    });

    return sessionResponseSchema.parse({
      accessToken,
      expiresAt: this.expiresAt(this.config.sessionTokenTtlSeconds),
      user: this.toAuthUser(identity),
    });
  }

  async issueOrganization(
    session: { sub: string; sid: string },
    access: OrganizationAccess,
  ): Promise<OrganizationTokenResponse> {
    const principal = organizationSessionPrincipalSchema.parse({
      sub: session.sub,
      sid: session.sid,
      tokenType: 'organization',
      organizationId: access.organization.id,
      membershipId: access.membershipId,
      role: access.role,
    });
    const accessToken = await this.jwt.signAsync(principal, {
      secret: this.config.organizationTokenSecret,
      algorithm: 'HS256',
      issuer: ISSUER,
      audience: 'caselog-api',
      expiresIn: this.config.organizationTokenTtlSeconds,
    });

    return organizationTokenResponseSchema.parse({
      accessToken,
      expiresAt: this.expiresAt(this.config.organizationTokenTtlSeconds),
      organization: access.organization,
      role: access.role,
    });
  }

  private toAuthUser(identity: Identity): Identity {
    return {
      id: identity.id,
      email: identity.email,
      displayName: identity.displayName,
      emailVerified: identity.emailVerified,
    };
  }

  private expiresAt(ttlSeconds: number): string {
    return new Date(Date.now() + ttlSeconds * 1_000).toISOString();
  }
}
