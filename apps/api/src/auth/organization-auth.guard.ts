import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiTokenScope, ApiTokenPrincipal } from '@caselog/schemas';
import { AuthGuard } from '@nestjs/passport';
import type { FastifyRequest } from 'fastify';
import { AuthorizationDeniedError, InvalidSessionError } from '../common/errors/domain.error';
import { isApiToken } from './api-token';
import { API_TOKEN_SCOPES } from './api-token-scope.decorator';
import { ApiTokenService } from './api-token.service';

@Injectable()
export class OrganizationAuthGuard extends AuthGuard('organization-jwt') implements CanActivate {
  constructor(
    @Inject(ApiTokenService) private readonly apiTokens: ApiTokenService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {
    super();
  }

  override canActivate(context: ExecutionContext): ReturnType<CanActivate['canActivate']> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.bearerToken(request.headers.authorization);
    if (!token?.startsWith('clg_')) return super.canActivate(context);
    return this.authorizeApiToken(context, token);
  }

  private async authorizeApiToken(context: ExecutionContext, token: string): Promise<boolean> {
    if (!isApiToken(token)) throw new InvalidSessionError();
    const principal = await this.apiTokens.authenticate(token);
    if (!principal) throw new InvalidSessionError();

    const requiredScopes = this.reflector.getAllAndOverride<ApiTokenScope[]>(API_TOKEN_SCOPES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredScopes?.every((scope) => principal.scopes.includes(scope))) {
      throw new AuthorizationDeniedError();
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: ApiTokenPrincipal }>();
    request.user = principal;
    return true;
  }

  private bearerToken(authorization: string | undefined): string | undefined {
    const match = /^Bearer (.+)$/.exec(authorization ?? '');
    return match?.[1];
  }
}
