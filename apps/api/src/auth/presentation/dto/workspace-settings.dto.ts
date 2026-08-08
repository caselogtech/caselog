import { deleteWorkspaceRequestSchema, updateWorkspaceRequestSchema } from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class UpdateWorkspaceRequestDto extends createZodDto(updateWorkspaceRequestSchema) {}

export class DeleteWorkspaceRequestDto extends createZodDto(deleteWorkspaceRequestSchema) {}
