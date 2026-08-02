import {
  createTestCaseRequestSchema,
  testCaseDetailParamsSchema,
  testCaseVersionParamsSchema,
  testCaseListParamsSchema,
  testCaseListQuerySchema,
  updateTestCaseRequestSchema,
  restoreTestCaseVersionRequestSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class TestCaseListParamsDto extends createZodDto(testCaseListParamsSchema) {}

export class TestCaseListQueryDto extends createZodDto(testCaseListQuerySchema) {}

export class CreateTestCaseRequestDto extends createZodDto(createTestCaseRequestSchema) {}

export class TestCaseDetailParamsDto extends createZodDto(testCaseDetailParamsSchema) {}

export class UpdateTestCaseRequestDto extends createZodDto(updateTestCaseRequestSchema) {}

export class TestCaseVersionParamsDto extends createZodDto(testCaseVersionParamsSchema) {}

export class RestoreTestCaseVersionRequestDto extends createZodDto(
  restoreTestCaseVersionRequestSchema,
) {}
