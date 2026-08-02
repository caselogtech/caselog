import {
  createTestRunRequestSchema,
  testRunListParamsSchema,
  testRunListQuerySchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class TestRunListParamsDto extends createZodDto(testRunListParamsSchema) {}
export class TestRunListQueryDto extends createZodDto(testRunListQuerySchema) {}
export class CreateTestRunRequestDto extends createZodDto(createTestRunRequestSchema) {}
