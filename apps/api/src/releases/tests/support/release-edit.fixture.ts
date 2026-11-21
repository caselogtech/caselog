import { randomUUID } from 'node:crypto';
import {
  sessionResponseSchema,
  organizationTokenResponseSchema,
  createReleaseResponseSchema,
  type ReleaseSummary,
} from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';

type EditorRole = 'OWNER' | 'READ_ONLY' | 'LEAD' | 'ADMIN';
type ReleaseEditFixture = {
  app: NestFastifyApplication;
  admin: ReturnType<typeof createPrismaClient>;
  organizationId: string;
  projectId: string;
  headers: { authorization: string };
  readerToken: string;
  issueToken: (role: EditorRole) => Promise<string>;
  environments: Array<{ id: string; state: string }>;
  foreignRelease: { id: string };
  createRelease: () => Promise<ReleaseSummary>;
  cleanup: () => Promise<void>;
};

export async function releaseEditFixture(): Promise<ReleaseEditFixture> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('Release edit tests require PostgreSQL');
  const admin = createPrismaClient(url);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app: NestFastifyApplication = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  await configureApplication(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const suffix = randomUUID().slice(0, 8);
  const organizations = await Promise.all(
    ['own', 'foreign'].map((label) =>
      admin.organization.create({
        data: { name: `Edit ${label}`, slug: `edit-${label}-${suffix}` },
      }),
    ),
  );
  const own = organizations[0];
  const foreign = organizations[1];
  if (!own || !foreign) throw new Error('Missing test organizations');
  const organizationId = own.id;
  const organizationSlug = own.slug;
  const projects = await Promise.all([
    admin.project.create({
      data: { organizationId, name: 'Checkout', key: 'CHECK', slug: 'checkout' },
    }),
    admin.project.create({
      data: { organizationId, name: 'Other', key: 'OTHER', slug: 'other' },
    }),
    admin.project.create({
      data: { organizationId: foreign.id, name: 'Foreign', key: 'CHECK', slug: 'checkout' },
    }),
  ]);
  const project = projects[0];
  const other = projects[1];
  const foreignProject = projects[2];
  if (!project || !other || !foreignProject) throw new Error('Missing test projects');
  const emails: string[] = [];
  async function token(role: EditorRole) {
    const email = `edit-${role.toLowerCase()}-${suffix}@example.com`;
    emails.push(email);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: 'Release editor',
        email,
        password: 'SyntheticPass123!long',
        termsAccepted: true,
      },
    });
    const session = sessionResponseSchema.parse(registration.json());
    const user = await admin.user.findUniqueOrThrow({ where: { email } });
    await admin.membership.create({ data: { organizationId, userId: user.id, role } });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${organizationSlug}/token`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    return organizationTokenResponseSchema.parse(response.json()).accessToken;
  }
  const ownerToken = await token('OWNER');
  const readerToken = await token('READ_ONLY');
  const environments = await Promise.all([
    admin.environment.create({
      data: {
        organizationId,
        projectId: project.id,
        name: 'Production',
        slug: 'production',
      },
    }),
    admin.environment.create({
      data: {
        organizationId,
        projectId: project.id,
        name: 'Archived',
        slug: 'archived',
        state: 'ARCHIVED',
      },
    }),
    admin.environment.create({
      data: { organizationId, projectId: other.id, name: 'Other', slug: 'other' },
    }),
    admin.environment.create({
      data: {
        organizationId: foreign.id,
        projectId: foreignProject.id,
        name: 'Foreign',
        slug: 'foreign',
      },
    }),
  ]);
  const foreignRelease = await admin.release.create({
    data: {
      organizationId: foreign.id,
      projectId: foreignProject.id,
      key: 'FOREIGN',
      name: 'Foreign',
    },
  });
  const headers = { authorization: `Bearer ${ownerToken}` };
  async function createRelease() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/checkout/releases',
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: { key: randomUUID(), name: 'Release without environment' },
    });
    return createReleaseResponseSchema.parse(response.json()).release;
  }
  async function cleanup() {
    const where = { organizationId: { in: organizations.map(({ id }) => id) } };
    await admin.integrationEvent.deleteMany({ where });
    await admin.releaseLifecycleEvent.deleteMany({ where });
    await admin.releaseCandidate.deleteMany({ where });
    await admin.release.deleteMany({ where });
    await admin.environment.deleteMany({ where });
    await admin.auditLog.deleteMany({ where });
    await admin.idempotencyRecord.deleteMany({ where });
    await admin.apiToken.deleteMany({ where });
    await admin.project.deleteMany({ where });
    await admin.membership.deleteMany({ where });
    await admin.organization.deleteMany({
      where: { id: { in: organizations.map(({ id }) => id) } },
    });
    await admin.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
    await admin.$disconnect();
  }
  return {
    app,
    admin,
    organizationId,
    projectId: project.id,
    headers,
    readerToken,
    issueToken: token,
    environments,
    foreignRelease,
    createRelease,
    cleanup,
  };
}
