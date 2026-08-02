import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { WorkspaceSummary } from '@caselog/schemas';
import { Prisma } from '../generated/prisma/client';
import type { MembershipRole } from '../generated/prisma/enums';
import { PrismaService } from '../core/database/prisma.service';

const MAX_WORKSPACES_PER_USER = 5;

const ROLE_MAP: Record<MembershipRole, WorkspaceSummary['role']> = {
  OWNER: 'owner',
  ADMIN: 'admin',
  LEAD: 'lead',
  TESTER: 'tester',
  CONTRIBUTOR: 'contributor',
  READ_ONLY: 'read_only',
};

const DEFAULT_STATUSES = [
  ['untested', 'Untested', '#64748B', 'circle', false, false],
  ['passed', 'Passed', '#16A34A', 'check', true, false],
  ['failed', 'Failed', '#DC2626', 'x', true, true],
  ['blocked', 'Blocked', '#D97706', 'ban', true, false],
  ['retest', 'Retest', '#2563EB', 'rotate-ccw', false, false],
  ['skipped', 'Skipped', '#475569', 'skip-forward', true, false],
] as const;

type WorkspaceRow = {
  organizationId: string;
  name: string;
  slug: string;
  membershipId: string;
  role: WorkspaceSummary['role'];
};

export type ProvisionedWorkspace = {
  workspace: WorkspaceSummary;
  demoProject: { id: string; key: string; name: string; slug: string };
};

export type ProvisionWorkspaceResult =
  | { kind: 'created'; value: ProvisionedWorkspace }
  | { kind: 'limit_reached' }
  | { kind: 'slug_conflict' };

@Injectable()
export class WorkspaceRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<WorkspaceSummary[]> {
    const rows = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT set_config('caselog.user_id', ${userId}, true)`;
      return transaction.$queryRaw<WorkspaceRow[]>`
        SELECT
          organization_id AS "organizationId",
          name,
          slug,
          membership_id AS "membershipId",
          role
        FROM public.list_current_user_workspaces()
      `;
    });
    return rows.map((row) => ({
      id: row.organizationId,
      name: row.name,
      slug: row.slug,
      membershipId: row.membershipId,
      role: row.role,
    }));
  }

  async isSlugAvailable(slug: string): Promise<boolean> {
    const organization = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    return !organization;
  }

  async provision(userId: string, name: string, slug: string): Promise<ProvisionWorkspaceResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT set_config('caselog.user_id', ${userId}, true)`;
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;

        const existing = await transaction.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::BIGINT AS count FROM public.list_current_user_workspaces()
        `;
        if ((existing[0]?.count ?? 0n) >= BigInt(MAX_WORKSPACES_PER_USER)) {
          return { kind: 'limit_reached' };
        }

        const organization = await transaction.organization.create({
          data: { name, slug },
          select: { id: true, name: true, slug: true },
        });
        await transaction.$executeRaw`
          SELECT set_config('caselog.organization_id', ${organization.id}, true)
        `;

        const membership = await transaction.membership.create({
          data: { organizationId: organization.id, userId, role: 'OWNER' },
          select: { id: true, role: true },
        });
        const project = await transaction.project.create({
          data: {
            organizationId: organization.id,
            key: 'DEMO',
            slug: 'demo',
            name: 'Demo Project',
          },
          select: { id: true, key: true, slug: true, name: true },
        });
        await transaction.usageCounter.create({ data: { organizationId: organization.id } });
        await transaction.resultStatus.createMany({
          data: DEFAULT_STATUSES.map(
            ([key, statusName, color, icon, isFinal, countsAsFailure], position) => ({
              organizationId: organization.id,
              projectId: project.id,
              key,
              name: statusName,
              color,
              icon,
              isFinal,
              countsAsFailure,
              position,
            }),
          ),
        });
        const suite = await transaction.suite.create({
          data: {
            organizationId: organization.id,
            projectId: project.id,
            name: 'Main suite',
          },
          select: { id: true },
        });
        const sectionId = randomUUID();
        await transaction.section.create({
          data: {
            organizationId: organization.id,
            id: sectionId,
            projectId: project.id,
            suiteId: suite.id,
            name: 'Getting started',
            path: `/${sectionId}`,
            depth: 0,
          },
        });

        return {
          kind: 'created',
          value: {
            workspace: {
              ...organization,
              membershipId: membership.id,
              role: ROLE_MAP[membership.role],
            },
            demoProject: project,
          },
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { kind: 'slug_conflict' };
      }
      throw error;
    }
  }
}
