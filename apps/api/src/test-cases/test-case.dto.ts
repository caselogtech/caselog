import {
  createTestCaseRequestSchema,
  testCaseDetailParamsSchema,
  testCaseListParamsSchema,
  testCaseListQuerySchema,
  updateTestCaseRequestSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class TestCaseListParamsDto extends createZodDto(testCaseListParamsSchema) {}

export class TestCaseListQueryDto extends createZodDto(testCaseListQuerySchema) {}

export class CreateTestCaseRequestDto extends createZodDto(createTestCaseRequestSchema) {}

export class TestCaseDetailParamsDto extends createZodDto(testCaseDetailParamsSchema) {}

export class UpdateTestCaseRequestDto extends createZodDto(updateTestCaseRequestSchema) {}
