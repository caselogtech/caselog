import {
  assignTestRunItemRequestSchema,
  createTestResultRequestSchema,
  createTestRunRequestSchema,
  testRunListParamsSchema,
  testRunListQuerySchema,
  testRunDetailParamsSchema,
  testRunDetailQuerySchema,
  testRunItemParamsSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class TestRunListParamsDto extends createZodDto(testRunListParamsSchema) {}
export class TestRunListQueryDto extends createZodDto(testRunListQuerySchema) {}
export class CreateTestRunRequestDto extends createZodDto(createTestRunRequestSchema) {}
export class TestRunDetailParamsDto extends createZodDto(testRunDetailParamsSchema) {}
export class TestRunItemParamsDto extends createZodDto(testRunItemParamsSchema) {}
export class TestRunDetailQueryDto extends createZodDto(testRunDetailQuerySchema) {}
export class AssignTestRunItemRequestDto extends createZodDto(assignTestRunItemRequestSchema) {}
export class CreateTestResultRequestDto extends createZodDto(createTestResultRequestSchema) {}
