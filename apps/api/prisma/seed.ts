import { PasswordService } from '../src/auth/application/services/password.service';
import { createPrismaClient } from '../src/core/database/infrastructure/prisma/prisma-client';
import { MembershipRole } from '../src/generated/prisma/enums';
import { DEMO_IDS } from './seed/demo-fixtures';
import { seedDemoReleases } from './seed/seed-demo-releases';
import { seedDemoTests } from './seed/seed-demo-tests';

const DEMO_PASSWORD = 'CaselogDemo123!';
const DEMO_VERIFIED_AT = new Date('2026-01-01T00:00:00.000Z');

const RESULT_STATUSES = [
  {
    id: '00000000-0000-4000-8000-000000000010',
    key: 'untested',
    name: 'Untested',
    color: '#64748B',
    icon: 'circle',
    isFinal: false,
    countsAsFailure: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000011',
    key: 'passed',
    name: 'Passed',
    color: '#16A34A',
    icon: 'check',
    isFinal: true,
    countsAsFailure: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    key: 'failed',
    name: 'Failed',
    color: '#DC2626',
    icon: 'x',
    isFinal: true,
    countsAsFailure: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000013',
    key: 'blocked',
    name: 'Blocked',
    color: '#D97706',
    icon: 'ban',
    isFinal: true,
    countsAsFailure: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000014',
    key: 'retest',
    name: 'Retest',
    color: '#2563EB',
    icon: 'rotate-ccw',
    isFinal: false,
    countsAsFailure: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000015',
    key: 'skipped',
    name: 'Skipped',
    color: '#475569',
    icon: 'skip-forward',
    isFinal: true,
    countsAsFailure: false,
  },
] as const;

async function seed(): Promise<void> {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error('MIGRATION_DATABASE_URL is required');

  const prisma = createPrismaClient(connectionString);
  const passwordService = new PasswordService();

  try {
    const organization = await prisma.organization.upsert({
      where: { slug: 'acme' },
      update: { name: 'Acme QA', deletedAt: null, purgeStartedAt: null },
      create: { id: DEMO_IDS.organization, name: 'Acme QA', slug: 'acme' },
    });

    const user = await prisma.user.upsert({
      where: { email: 'demo@caselog.local' },
      update: { displayName: 'Demo Owner', emailVerifiedAt: DEMO_VERIFIED_AT },
      create: {
        id: DEMO_IDS.user,
        email: 'demo@caselog.local',
        displayName: 'Demo Owner',
        emailVerifiedAt: DEMO_VERIFIED_AT,
      },
    });
    const passwordHash = await passwordService.hash(DEMO_PASSWORD);
    await prisma.passwordCredential.upsert({
      where: { userId: user.id },
      update: { passwordHash },
      create: { userId: user.id, passwordHash },
    });

    await prisma.membership.upsert({
      where: {
        organizationId_userId: { organizationId: organization.id, userId: user.id },
      },
      update: { role: MembershipRole.OWNER, deletedAt: null },
      create: {
        organizationId: organization.id,
        userId: user.id,
        role: MembershipRole.OWNER,
      },
    });

    const project = await prisma.project.upsert({
      where: {
        organizationId_slug: { organizationId: organization.id, slug: 'checkout' },
      },
      update: { name: 'Checkout', key: 'WEB', nextCaseNumber: 11n, deletedAt: null },
      create: {
        organizationId: organization.id,
        id: DEMO_IDS.project,
        key: 'WEB',
        slug: 'checkout',
        name: 'Checkout',
        nextCaseNumber: 11n,
      },
    });

    await prisma.usageCounter.upsert({
      where: { organizationId: organization.id },
      update: {},
      create: { organizationId: organization.id },
    });

    for (const [position, status] of RESULT_STATUSES.entries()) {
      await prisma.resultStatus.upsert({
        where: {
          organizationId_projectId_key: {
            organizationId: organization.id,
            projectId: project.id,
            key: status.key,
          },
        },
        update: { ...status, position, deletedAt: null },
        create: {
          ...status,
          organizationId: organization.id,
          projectId: project.id,
          position,
        },
      });
    }

    await seedDemoTests(prisma, organization.id, project.id, user.id);
    await seedDemoReleases(prisma, organization.id, project.id, user.id);
  } finally {
    await prisma.$disconnect();
  }
}

void seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
