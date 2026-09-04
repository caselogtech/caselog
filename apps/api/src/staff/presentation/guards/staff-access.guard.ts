import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { SessionPrincipal, StaffOperator, StaffOperatorRole } from '@caselog/schemas';
import { AuthorizationDeniedError, InvalidSessionError } from '../../../common/errors/domain.error';
import { StaffAccessService } from '../../application/services/staff-access.service';
import { hasStaffRole } from '../../domain/policies/staff-access.policy';
import { STAFF_ROLE_METADATA } from '../decorators/staff-role.decorator';

@Injectable()
export class StaffAccessGuard implements CanActivate {
  constructor(
    @Inject(StaffAccessService) private readonly access: StaffAccessService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: SessionPrincipal; staffOperator?: StaffOperator }>();
    if (!request.user) throw new InvalidSessionError();

    const operator = await this.access.authenticate(request.user);
    const requiredRole = this.reflector.getAllAndOverride<StaffOperatorRole>(STAFF_ROLE_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRole && !hasStaffRole(operator.role, requiredRole)) {
      throw new AuthorizationDeniedError();
    }
    request.staffOperator = operator;
    return true;
  }
}
