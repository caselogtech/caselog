import { instanceCapabilitiesSchema } from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class InstanceCapabilitiesResponseDto extends createZodDto(instanceCapabilitiesSchema) {}
