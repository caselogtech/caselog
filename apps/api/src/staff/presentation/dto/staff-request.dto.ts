import {
  grantStaffOperatorRequestSchema,
  revokeStaffOperatorRequestSchema,
  staffListQuerySchema,
  staffOperatorParamsSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class StaffListQueryDto extends createZodDto(staffListQuerySchema) {}
export class GrantStaffOperatorRequestDto extends createZodDto(grantStaffOperatorRequestSchema) {}
export class RevokeStaffOperatorRequestDto extends createZodDto(revokeStaffOperatorRequestSchema) {}
export class StaffOperatorParamsDto extends createZodDto(staffOperatorParamsSchema) {}
