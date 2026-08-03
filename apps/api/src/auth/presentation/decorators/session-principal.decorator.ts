import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SessionPrincipal } from '@caselog/schemas';
import type { FastifyRequest } from 'fastify';

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionPrincipal => {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: SessionPrincipal }>();
    return request.user;
  },
);
