import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { sessionPrincipalSchema, type SessionPrincipal } from '@caselog/schemas';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InvalidSessionError } from '../common/errors/domain.error';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { IdentityRepository } from './identity.repository';

@Injectable()
export class SessionJwtStrategy extends PassportStrategy(Strategy, 'session-jwt') {
  constructor(
    @Inject(AUTH_CONFIG) config: AuthConfig,
    @Inject(IdentityRepository) private readonly identities: IdentityRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.sessionTokenSecret,
      algorithms: ['HS256'],
      issuer: 'caselog-api',
      audience: 'caselog-web',
      ignoreExpiration: false,
    });
  }

  async validate(payload: unknown): Promise<SessionPrincipal> {
    const parsed = sessionPrincipalSchema.safeParse(payload);
    if (!parsed.success) {
      throw new InvalidSessionError();
    }

    const active = await this.identities.isSessionActive(parsed.data.sid, parsed.data.sub);
    if (!active) {
      throw new InvalidSessionError();
    }

    return parsed.data;
  }
}
