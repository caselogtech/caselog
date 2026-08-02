import {
  createTestCaseRequestSchema,
  testCaseListParamsSchema,
  testCaseListQuerySchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class TestCaseListParamsDto extends createZodDto(testCaseListParamsSchema) {}

export class TestCaseListQueryDto extends createZodDto(testCaseListQuerySchema) {}

export class CreateTestCaseRequestDto extends createZodDto(createTestCaseRequestSchema) {}
