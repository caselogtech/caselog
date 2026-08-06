import {
  csvImportHeadersSchema,
  csvImportParamsSchema,
  csvImportPreviewResponseSchema,
  csvImportRequestSchema,
  csvImportResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class CsvImportParamsDto extends createZodDto(csvImportParamsSchema) {}
export class CsvImportRequestDto extends createZodDto(csvImportRequestSchema) {}
export class CsvImportHeadersDto extends createZodDto(csvImportHeadersSchema) {}
export class CsvImportPreviewResponseDto extends createZodDto(csvImportPreviewResponseSchema) {}
export class CsvImportResponseDto extends createZodDto(csvImportResponseSchema) {}
