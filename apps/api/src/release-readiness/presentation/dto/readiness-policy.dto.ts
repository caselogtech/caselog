import {
  createReadinessPolicyRequestSchema,
  createReadinessPolicyVersionRequestSchema,
  readinessPolicyParamsSchema,
  readinessPolicyListQuerySchema,
  readinessPolicyProjectParamsSchema,
  readinessPolicyWriteHeadersSchema,
} from '@caselog/schemas/readiness';
import { createZodDto } from 'nestjs-zod';

export class ReadinessPolicyProjectParamsDto extends createZodDto(
  readinessPolicyProjectParamsSchema,
) {}
export class ReadinessPolicyParamsDto extends createZodDto(readinessPolicyParamsSchema) {}
export class ReadinessPolicyListQueryDto extends createZodDto(readinessPolicyListQuerySchema) {}
export class ReadinessPolicyWriteHeadersDto extends createZodDto(
  readinessPolicyWriteHeadersSchema,
) {}
export class CreateReadinessPolicyRequestDto extends createZodDto(
  createReadinessPolicyRequestSchema,
) {}
export class CreateReadinessPolicyVersionRequestDto extends createZodDto(
  createReadinessPolicyVersionRequestSchema,
) {}
