import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { OrganizationAccessPrincipal } from '@caselog/schemas';
import type { FastifyRequest } from 'fastify';

export const CurrentOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrganizationAccessPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: OrganizationAccessPrincipal }>();
    return request.user;
  },
);
