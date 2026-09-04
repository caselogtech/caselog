import {
  staffAuditLogListResponseSchema,
  staffBillingAccountListResponseSchema,
  staffOperatorListResponseSchema,
  staffOperatorResponseSchema,
  staffOverviewResponseSchema,
  staffSessionResponseSchema,
  staffUserListResponseSchema,
  staffWorkspaceListResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class StaffSessionResponseDto extends createZodDto(staffSessionResponseSchema) {}
export class StaffOverviewResponseDto extends createZodDto(staffOverviewResponseSchema) {}
export class StaffUserListResponseDto extends createZodDto(staffUserListResponseSchema) {}
export class StaffWorkspaceListResponseDto extends createZodDto(staffWorkspaceListResponseSchema) {}
export class StaffBillingAccountListResponseDto extends createZodDto(
  staffBillingAccountListResponseSchema,
) {}
export class StaffOperatorListResponseDto extends createZodDto(staffOperatorListResponseSchema) {}
export class StaffOperatorResponseDto extends createZodDto(staffOperatorResponseSchema) {}
export class StaffAuditLogListResponseDto extends createZodDto(staffAuditLogListResponseSchema) {}
