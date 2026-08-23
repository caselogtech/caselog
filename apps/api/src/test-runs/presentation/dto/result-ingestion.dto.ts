import {
  resultIngestionListParamsSchema,
  resultIngestionListQuerySchema,
  resultIngestionListResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class ResultIngestionListParamsDto extends createZodDto(resultIngestionListParamsSchema) {}
export class ResultIngestionListQueryDto extends createZodDto(resultIngestionListQuerySchema) {}
export class ResultIngestionListResponseDto extends createZodDto(
  resultIngestionListResponseSchema,
) {}
