import {
  createReadinessWaiverRequestSchema,
  readinessDecisionParamsSchema,
  readinessWaiverListQuerySchema,
  readinessWaiverParamsSchema,
  readinessWaiverWriteHeadersSchema,
  revokeReadinessWaiverRequestSchema,
} from '@caselog/schemas/readiness';
import { createZodDto } from 'nestjs-zod';

export class ReadinessWaiverDecisionParamsDto extends createZodDto(readinessDecisionParamsSchema) {}
export class ReadinessWaiverParamsDto extends createZodDto(readinessWaiverParamsSchema) {}
export class ReadinessWaiverWriteHeadersDto extends createZodDto(
  readinessWaiverWriteHeadersSchema,
) {}
export class CreateReadinessWaiverRequestDto extends createZodDto(
  createReadinessWaiverRequestSchema,
) {}
export class RevokeReadinessWaiverRequestDto extends createZodDto(
  revokeReadinessWaiverRequestSchema,
) {}
export class ReadinessWaiverListQueryDto extends createZodDto(readinessWaiverListQuerySchema) {}
