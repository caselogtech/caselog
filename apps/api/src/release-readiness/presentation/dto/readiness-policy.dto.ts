import {
  createReadinessPolicyRequestSchema,
  createReadinessPolicyVersionRequestSchema,
  readinessPolicyParamsSchema,
  readinessPolicyProjectParamsSchema,
  readinessPolicyWriteHeadersSchema,
} from '@caselog/schemas/readiness';
import { createZodDto } from 'nestjs-zod';

export class ReadinessPolicyProjectParamsDto extends createZodDto(
  readinessPolicyProjectParamsSchema,
) {}
export class ReadinessPolicyParamsDto extends createZodDto(readinessPolicyParamsSchema) {}
export class ReadinessPolicyWriteHeadersDto extends createZodDto(
  readinessPolicyWriteHeadersSchema,
) {}
export class CreateReadinessPolicyRequestDto extends createZodDto(
  createReadinessPolicyRequestSchema,
) {}
export class CreateReadinessPolicyVersionRequestDto extends createZodDto(
  createReadinessPolicyVersionRequestSchema,
) {}
