import { caseExecutionHistoryResponseSchema, runProgressResponseSchema } from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class RunProgressResponseDto extends createZodDto(runProgressResponseSchema) {}
export class CaseExecutionHistoryResponseDto extends createZodDto(
  caseExecutionHistoryResponseSchema,
) {}
