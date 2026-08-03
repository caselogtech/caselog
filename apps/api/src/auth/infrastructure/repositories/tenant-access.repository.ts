import { Inject, Injectable } from '@nestjs/common';
import type { OrganizationAccessPrincipal, OrganizationSessionPrincipal } from '@caselog/schemas';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type { MembershipRole } from '../../../generated/prisma/enums';

type AccessRole = OrganizationAccessPrincipal['role'];

const ROLE_MAP: Record<MembershipRole, AccessRole> = {
  OWNER: 'owner',
  ADMIN: 'admin',
  LEAD: 'lead',
  TESTER: 'tester',
  CONTRIBUTOR: 'contributor',
  READ_ONLY: 'read_only',
};

export type OrganizationAccess = {
  organization: { id: string; name: string; slug: string };
  membershipId: string;
  role: AccessRole;
};

@Injectable()
export class TenantAccessRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async findBySlug(userId: string, slug: string): Promise<OrganizationAccess | undefined> {
    const organization = await this.prisma.organization.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, name: true, slug: true },
    });

    if (!organization) {
      return undefined;
    }

    const membership = await this.tenantDatabase.run(organization.id, (transaction) =>
      transaction.membership.findUnique({
        where: {
          organizationId_userId: { organizationId: organization.id, userId },
          deletedAt: null,
        },
        select: { id: true, role: true },
      }),
    );

    if (!membership) {
      return undefined;
    }

    return {
      organization,
      membershipId: membership.id,
      role: ROLE_MAP[membership.role],
    };
  }

  async validatePrincipal(
    principal: OrganizationSessionPrincipal,
  ): Promise<OrganizationSessionPrincipal | undefined> {
    const membership = await this.tenantDatabase.run(principal.organizationId, (transaction) =>
      transaction.membership.findUnique({
        where: {
          organizationId_id: {
            organizationId: principal.organizationId,
            id: principal.membershipId,
          },
          userId: principal.sub,
          deletedAt: null,
        },
        select: { role: true },
      }),
    );

    if (!membership) {
      return undefined;
    }

    return { ...principal, role: ROLE_MAP[membership.role] };
  }
}
