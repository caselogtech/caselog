import {
  assignTestRunItemRequestSchema,
  bulkTestResultsRequestSchema,
  createTestResultRequestSchema,
  createTestRunRequestSchema,
  createTestRunHeadersSchema,
  idempotencyHeadersSchema,
  junitUploadHeadersSchema,
  testRunListParamsSchema,
  testRunListQuerySchema,
  testRunDetailParamsSchema,
  testRunDetailQuerySchema,
  testRunItemParamsSchema,
  testResultHistoryQuerySchema,
  testResultParamsSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class TestRunListParamsDto extends createZodDto(testRunListParamsSchema) {}
export class TestRunListQueryDto extends createZodDto(testRunListQuerySchema) {}
export class CreateTestRunRequestDto extends createZodDto(createTestRunRequestSchema) {}
export class CreateTestRunHeadersDto extends createZodDto(createTestRunHeadersSchema) {}
export class IdempotencyHeadersDto extends createZodDto(idempotencyHeadersSchema) {}
export class JUnitUploadHeadersDto extends createZodDto(junitUploadHeadersSchema) {}
export class BulkTestResultsRequestDto extends createZodDto(bulkTestResultsRequestSchema) {}
export class TestRunDetailParamsDto extends createZodDto(testRunDetailParamsSchema) {}
export class TestRunItemParamsDto extends createZodDto(testRunItemParamsSchema) {}
export class TestRunDetailQueryDto extends createZodDto(testRunDetailQuerySchema) {}
export class AssignTestRunItemRequestDto extends createZodDto(assignTestRunItemRequestSchema) {}
export class CreateTestResultRequestDto extends createZodDto(createTestResultRequestSchema) {}
export class TestResultHistoryQueryDto extends createZodDto(testResultHistoryQuerySchema) {}
export class TestResultParamsDto extends createZodDto(testResultParamsSchema) {}
