import { CaseTemplate, MembershipRole } from '../src/generated/prisma/enums';
import { PasswordService } from '../src/auth/application/services/password.service';
import { createPrismaClient } from '../src/core/database/infrastructure/prisma/prisma-client';

const DEMO_PASSWORD = 'CaselogDemo123!';
const DEMO_VERIFIED_AT = new Date('2026-01-01T00:00:00.000Z');

const IDS = {
  organization: '00000000-0000-4000-8000-000000000001',
  user: '00000000-0000-4000-8000-000000000002',
  project: '00000000-0000-4000-8000-000000000003',
  suite: '00000000-0000-4000-8000-000000000004',
  section: '00000000-0000-4000-8000-000000000005',
} as const;

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

const DEMO_CASES = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    versionId: '00000000-0000-4000-8000-000000000111',
    caseNumber: 1n,
    title: 'Sign in with valid credentials',
    action: 'Enter a registered email and valid password, then submit the form',
    expected: 'The project dashboard opens',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    versionId: '00000000-0000-4000-8000-000000000112',
    caseNumber: 2n,
    title: 'Reject an invalid password',
    action: 'Enter a registered email and an invalid password, then submit the form',
    expected: 'A generic authentication error is shown and no session is created',
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    versionId: '00000000-0000-4000-8000-000000000113',
    caseNumber: 3n,
    title: 'Sign out from the current session',
    action: 'Choose Sign out from the account menu',
    expected: 'The session is revoked and the login page opens',
  },
] as const;

async function seed(): Promise<void> {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error('MIGRATION_DATABASE_URL is required');
  }

  const prisma = createPrismaClient(connectionString);
  const passwordService = new PasswordService();

  try {
    const organization = await prisma.organization.upsert({
      where: { slug: 'acme' },
      update: { name: 'Acme QA' },
      create: { id: IDS.organization, name: 'Acme QA', slug: 'acme' },
    });

    const user = await prisma.user.upsert({
      where: { email: 'demo@caselog.local' },
      update: { displayName: 'Demo Owner', emailVerifiedAt: DEMO_VERIFIED_AT },
      create: {
        id: IDS.user,
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
      update: { name: 'Checkout', deletedAt: null },
      create: {
        organizationId: organization.id,
        id: IDS.project,
        key: 'WEB',
        slug: 'checkout',
        name: 'Checkout',
        nextCaseNumber: 4n,
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

    const suite = await prisma.suite.upsert({
      where: {
        organizationId_projectId_name: {
          organizationId: organization.id,
          projectId: project.id,
          name: 'Main suite',
        },
      },
      update: { deletedAt: null },
      create: {
        organizationId: organization.id,
        id: IDS.suite,
        projectId: project.id,
        name: 'Main suite',
      },
    });

    const sectionPath = `/${IDS.section}`;
    const section = await prisma.section.upsert({
      where: {
        organizationId_suiteId_path: {
          organizationId: organization.id,
          suiteId: suite.id,
          path: sectionPath,
        },
      },
      update: { name: 'Authentication', deletedAt: null },
      create: {
        organizationId: organization.id,
        id: IDS.section,
        projectId: project.id,
        suiteId: suite.id,
        name: 'Authentication',
        path: sectionPath,
        depth: 0,
      },
    });

    for (const demoCase of DEMO_CASES) {
      const testCase = await prisma.testCase.upsert({
        where: {
          organizationId_projectId_caseNumber: {
            organizationId: organization.id,
            projectId: project.id,
            caseNumber: demoCase.caseNumber,
          },
        },
        update: { sectionId: section.id, deletedAt: null },
        create: {
          organizationId: organization.id,
          id: demoCase.id,
          projectId: project.id,
          suiteId: suite.id,
          sectionId: section.id,
          caseNumber: demoCase.caseNumber,
        },
      });

      const version = await prisma.testCaseVersion.upsert({
        where: {
          organizationId_testCaseId_version: {
            organizationId: organization.id,
            testCaseId: testCase.id,
            version: 1,
          },
        },
        update: {},
        create: {
          organizationId: organization.id,
          id: demoCase.versionId,
          testCaseId: testCase.id,
          version: 1,
          title: demoCase.title,
          template: CaseTemplate.STEPS,
          content: {
            steps: [{ action: demoCase.action, expected: demoCase.expected }],
          },
          createdById: user.id,
        },
      });

      await prisma.testCase.update({
        where: {
          organizationId_id: { organizationId: organization.id, id: testCase.id },
        },
        data: { currentVersionId: version.id },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

void seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
