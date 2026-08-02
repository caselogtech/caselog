import {
  createTestCaseRequestSchema,
  createSuiteRequestSchema,
  updateSuiteRequestSchema,
  moveSuiteRequestSchema,
  suiteParamsSchema,
  createSectionRequestSchema,
  updateSectionRequestSchema,
  moveSectionRequestSchema,
  sectionParamsSchema,
  createSectionParamsSchema,
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

export class CreateSuiteRequestDto extends createZodDto(createSuiteRequestSchema) {}
export class UpdateSuiteRequestDto extends createZodDto(updateSuiteRequestSchema) {}
export class MoveSuiteRequestDto extends createZodDto(moveSuiteRequestSchema) {}
export class SuiteParamsDto extends createZodDto(suiteParamsSchema) {}
export class CreateSectionRequestDto extends createZodDto(createSectionRequestSchema) {}
export class UpdateSectionRequestDto extends createZodDto(updateSectionRequestSchema) {}
export class MoveSectionRequestDto extends createZodDto(moveSectionRequestSchema) {}
export class SectionParamsDto extends createZodDto(sectionParamsSchema) {}
export class CreateSectionParamsDto extends createZodDto(createSectionParamsSchema) {}
