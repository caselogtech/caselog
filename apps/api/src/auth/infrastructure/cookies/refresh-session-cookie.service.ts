import { Inject, Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SessionResponse } from '@caselog/schemas';
import type { SessionResult } from '../../application/services/auth.service';
import { AUTH_CONFIG, type AuthConfig } from '../config/auth.config';

const REFRESH_COOKIE_DEVELOPMENT = 'caselog_refresh';
const REFRESH_COOKIE_PRODUCTION = '__Host-caselog_refresh';

@Injectable()
export class RefreshSessionCookieService {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  read(request: FastifyRequest): string | undefined {
    return request.cookies[this.name];
  }

  set(reply: FastifyReply, result: SessionResult): SessionResponse {
    reply.header('Cache-Control', 'no-store').setCookie(this.name, result.refreshToken, {
      httpOnly: true,
      secure: this.config.production,
      sameSite: 'lax',
      path: '/',
      maxAge: this.config.refreshTokenTtlDays * 86_400,
    });
    return result.response;
  }

  clear(reply: FastifyReply): void {
    reply.clearCookie(this.name, { path: '/' });
  }

  private get name(): string {
    return this.config.production ? REFRESH_COOKIE_PRODUCTION : REFRESH_COOKIE_DEVELOPMENT;
  }
}
