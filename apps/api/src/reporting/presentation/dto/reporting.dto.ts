import { runProgressParamsSchema } from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class RunProgressParamsDto extends createZodDto(runProgressParamsSchema) {}
