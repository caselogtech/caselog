import { SetMetadata } from '@nestjs/common';
import type { StaffOperatorRole } from '@caselog/schemas';

export const STAFF_ROLE_METADATA = 'caselog.staff.required-role';
export const RequireStaffRole = (role: StaffOperatorRole) => SetMetadata(STAFF_ROLE_METADATA, role);
