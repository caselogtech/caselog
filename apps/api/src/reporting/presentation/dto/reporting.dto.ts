import {
  caseExecutionHistoryParamsSchema,
  caseExecutionHistoryQuerySchema,
  runProgressParamsSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class RunProgressParamsDto extends createZodDto(runProgressParamsSchema) {}
export class CaseExecutionHistoryParamsDto extends createZodDto(caseExecutionHistoryParamsSchema) {}
export class CaseExecutionHistoryQueryDto extends createZodDto(caseExecutionHistoryQuerySchema) {}
