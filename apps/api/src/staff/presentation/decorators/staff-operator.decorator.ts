import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { StaffOperator } from '@caselog/schemas';

export const CurrentStaffOperator = createParamDecorator(
  (_data: unknown, context: ExecutionContext): StaffOperator => {
    return context.switchToHttp().getRequest<FastifyRequest & { staffOperator: StaffOperator }>()
      .staffOperator;
  },
);
