import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OrganizationAccessPrincipal } from '@caselog/schemas';
import type { FastifyRequest } from 'fastify';
import { AuthorizationDeniedError } from '../../../common/errors/domain.error';
import {
  ORGANIZATION_ACCESS_LEVEL,
  type OrganizationAccessLevel,
} from '../decorators/organization-access.decorator';

const ROLE_LEVEL: Record<OrganizationAccessPrincipal['role'], number> = {
  read_only: 0,
  contributor: 1,
  tester: 1,
  lead: 2,
  admin: 3,
  owner: 3,
};

const ACCESS_LEVEL: Record<OrganizationAccessLevel, number> = {
  read: 0,
  write: 1,
  lead: 2,
  admin: 3,
};

@Injectable()
export class OrganizationRoleGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: OrganizationAccessPrincipal }>();
    if (!request.user) throw new AuthorizationDeniedError();
    const required =
      this.reflector.getAllAndOverride<OrganizationAccessLevel>(ORGANIZATION_ACCESS_LEVEL, [
        context.getHandler(),
        context.getClass(),
      ]) ?? this.defaultAccess(request.method);

    if (ROLE_LEVEL[request.user.role] < ACCESS_LEVEL[required]) {
      throw new AuthorizationDeniedError();
    }
    return true;
  }

  private defaultAccess(method: string): OrganizationAccessLevel {
    return method === 'GET' || method === 'HEAD' ? 'read' : 'write';
  }
}
