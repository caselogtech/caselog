import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  organizationAccessPrincipalSchema,
  type OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InvalidSessionError } from '../common/errors/domain.error';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { IdentityRepository } from './identity.repository';
import { TenantAccessRepository } from './tenant-access.repository';

@Injectable()
export class OrganizationJwtStrategy extends PassportStrategy(Strategy, 'organization-jwt') {
  constructor(
    @Inject(AUTH_CONFIG) config: AuthConfig,
    @Inject(IdentityRepository) private readonly identities: IdentityRepository,
    @Inject(TenantAccessRepository) private readonly tenantAccess: TenantAccessRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.organizationTokenSecret,
      algorithms: ['HS256'],
      issuer: 'caselog-api',
      audience: 'caselog-api',
      ignoreExpiration: false,
    });
  }

  async validate(payload: unknown): Promise<OrganizationAccessPrincipal> {
    const parsed = organizationAccessPrincipalSchema.safeParse(payload);
    if (!parsed.success) {
      throw new InvalidSessionError();
    }

    const activeSession = await this.identities.isSessionActive(parsed.data.sid, parsed.data.sub);
    if (!activeSession) {
      throw new InvalidSessionError();
    }

    const principal = await this.tenantAccess.validatePrincipal(parsed.data);
    if (!principal) {
      throw new InvalidSessionError();
    }
    return principal;
  }
}
