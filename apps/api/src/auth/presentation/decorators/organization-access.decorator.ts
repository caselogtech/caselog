import { SetMetadata } from '@nestjs/common';

export type OrganizationAccessLevel = 'read' | 'write' | 'lead' | 'admin';

export const ORGANIZATION_ACCESS_LEVEL = 'caselog:organization-access-level';

export function RequireOrganizationAccess(level: OrganizationAccessLevel) {
  return SetMetadata(ORGANIZATION_ACCESS_LEVEL, level);
}
