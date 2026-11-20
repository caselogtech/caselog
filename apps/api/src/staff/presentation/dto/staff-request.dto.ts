import {
  grantStaffOperatorRequestSchema,
  revokeStaffOperatorRequestSchema,
  staffListQuerySchema,
  staffAuditLogListQuerySchema,
  staffUserParamsSchema,
  staffUserDetailQuerySchema,
  staffWorkspaceListQuerySchema,
  staffWorkspaceParamsSchema,
  staffOperatorParamsSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class StaffListQueryDto extends createZodDto(staffListQuerySchema) {}
export class GrantStaffOperatorRequestDto extends createZodDto(grantStaffOperatorRequestSchema) {}
export class RevokeStaffOperatorRequestDto extends createZodDto(revokeStaffOperatorRequestSchema) {}
export class StaffOperatorParamsDto extends createZodDto(staffOperatorParamsSchema) {}

export class StaffWorkspaceListQueryDto extends createZodDto(staffWorkspaceListQuerySchema) {}
export class StaffWorkspaceParamsDto extends createZodDto(staffWorkspaceParamsSchema) {}

export class StaffUserParamsDto extends createZodDto(staffUserParamsSchema) {}
export class StaffUserDetailQueryDto extends createZodDto(staffUserDetailQuerySchema) {}

export class StaffAuditLogListQueryDto extends createZodDto(staffAuditLogListQuerySchema) {}
