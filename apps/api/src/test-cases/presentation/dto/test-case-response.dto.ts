import {
  createTestCaseResponseSchema,
  projectStructureResponseSchema,
  sectionResponseSchema,
  suiteResponseSchema,
  testCaseDetailResponseSchema,
  testCaseLifecycleResponseSchema,
  testCaseListResponseSchema,
  testCaseVersionSchema,
  updateTestCaseResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class ProjectStructureResponseDto extends createZodDto(projectStructureResponseSchema) {}
export class SuiteResponseDto extends createZodDto(suiteResponseSchema) {}
export class SectionResponseDto extends createZodDto(sectionResponseSchema) {}
export class TestCaseListResponseDto extends createZodDto(testCaseListResponseSchema) {}
export class CreateTestCaseResponseDto extends createZodDto(createTestCaseResponseSchema) {}
export class TestCaseDetailResponseDto extends createZodDto(testCaseDetailResponseSchema) {}
export class TestCaseVersionResponseDto extends createZodDto(testCaseVersionSchema) {}
export class UpdateTestCaseResponseDto extends createZodDto(updateTestCaseResponseSchema) {}
export class TestCaseLifecycleResponseDto extends createZodDto(testCaseLifecycleResponseSchema) {}
