import {
  assignTestRunItemResponseSchema,
  bulkTestResultsResponseSchema,
  createTestResultResponseSchema,
  createTestRunResponseSchema,
  junitUploadResponseSchema,
  testResultDetailResponseSchema,
  testResultHistoryResponseSchema,
  testRunDetailResponseSchema,
  testRunLifecycleResponseSchema,
  testRunListResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class TestRunListResponseDto extends createZodDto(testRunListResponseSchema) {}
export class CreateTestRunResponseDto extends createZodDto(createTestRunResponseSchema) {}
export class BulkTestResultsResponseDto extends createZodDto(bulkTestResultsResponseSchema) {}
export class JUnitUploadResponseDto extends createZodDto(junitUploadResponseSchema) {}
export class TestRunDetailResponseDto extends createZodDto(testRunDetailResponseSchema) {}
export class TestRunLifecycleResponseDto extends createZodDto(testRunLifecycleResponseSchema) {}
export class AssignTestRunItemResponseDto extends createZodDto(assignTestRunItemResponseSchema) {}
export class CreateTestResultResponseDto extends createZodDto(createTestResultResponseSchema) {}
export class TestResultHistoryResponseDto extends createZodDto(testResultHistoryResponseSchema) {}
export class TestResultDetailResponseDto extends createZodDto(testResultDetailResponseSchema) {}
