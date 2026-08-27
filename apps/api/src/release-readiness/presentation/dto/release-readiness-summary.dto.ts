import {
  releaseReadinessListQuerySchema,
  releaseReadinessListResponseSchema,
} from '@caselog/schemas/readiness';
import { createZodDto } from 'nestjs-zod';

export class ReleaseReadinessListQueryDto extends createZodDto(releaseReadinessListQuerySchema) {}
export class ReleaseReadinessListResponseDto extends createZodDto(
  releaseReadinessListResponseSchema,
) {}
