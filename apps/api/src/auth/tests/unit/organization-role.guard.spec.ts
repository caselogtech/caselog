import type { ExecutionContext } from '@nestjs/common';
import type { OrganizationAccessPrincipal } from '@caselog/schemas';
import { describe, expect, it } from 'vitest';
import { AuthorizationDeniedError } from '../../../common/errors/domain.error';
import type { OrganizationAccessLevel } from '../../presentation/decorators/organization-access.decorator';
import { OrganizationRoleGuard } from '../../presentation/guards/organization-role.guard';

describe('OrganizationRoleGuard', () => {
  it('allows every member to use read endpoints', () => {
    expect(canActivate('read_only', 'GET')).toBe(true);
  });

  it('denies read-only members on mutation endpoints by default', () => {
    expect(() => canActivate('read_only', 'POST')).toThrow(AuthorizationDeniedError);
  });

  it('allows explicitly read-only POST endpoints', () => {
    expect(canActivate('read_only', 'POST', 'read')).toBe(true);
  });

  it('enforces lead and admin overrides', () => {
    expect(() => canActivate('tester', 'POST', 'lead')).toThrow(AuthorizationDeniedError);
    expect(canActivate('lead', 'POST', 'lead')).toBe(true);
    expect(() => canActivate('lead', 'POST', 'admin')).toThrow(AuthorizationDeniedError);
    expect(canActivate('admin', 'POST', 'admin')).toBe(true);
    expect(canActivate('owner', 'POST', 'admin')).toBe(true);
  });

  it('fails closed when authentication did not populate a principal', () => {
    const guard = new OrganizationRoleGuard(new AccessReflector() as never);
    expect(() => guard.canActivate(context('GET'))).toThrow(AuthorizationDeniedError);
  });
});

function canActivate(
  role: OrganizationAccessPrincipal['role'],
  method: string,
  access?: OrganizationAccessLevel,
): boolean {
  const guard = new OrganizationRoleGuard(new AccessReflector(access) as never);
  return guard.canActivate(context(method, principal(role)));
}

class AccessReflector {
  constructor(private readonly access?: OrganizationAccessLevel) {}

  getAllAndOverride(): OrganizationAccessLevel | undefined {
    return this.access;
  }
}

function context(method: string, user?: OrganizationAccessPrincipal): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ method, user }) }) as never,
  } as unknown as ExecutionContext;
}

function principal(role: OrganizationAccessPrincipal['role']): OrganizationAccessPrincipal {
  return {
    sub: '3edbeea6-7687-453c-a8d3-154b60c3de3e',
    sid: '3aeb1142-e3d5-4ad5-aaac-2bb82f5cbd79',
    tokenType: 'organization',
    organizationId: 'f4dd6766-9e2c-468f-ab58-c3ff3a30bfda',
    membershipId: '90cd9123-cc53-4d41-95e5-57aa1dbe19de',
    role,
  };
}
