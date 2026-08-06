import { createHash, randomUUID } from 'node:crypto';
import {
  createTestResultResponseSchema,
  createUploadSessionResponseSchema,
} from '@caselog/schemas';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { PrismaClient } from '../../../generated/prisma/client';

export type JiraResultFixture = {
  projectSlug: string;
  caseId: string;
  runId: string;
  itemId: string;
  resultId: string;
  attachmentId: string;
};

export async function createJiraResultFixture(
  admin: PrismaClient,
  app: NestFastifyApplication,
  organizationId: string,
  organizationToken: string,
  userId: string,
): Promise<JiraResultFixture> {
  const projectSlug = 'jira-links';
  const project = await admin.project.create({
    data: { organizationId, key: 'JLINK', slug: projectSlug, name: 'Jira links' },
  });
  const [failedStatus] = await Promise.all([
    admin.resultStatus.create({
      data: {
        organizationId,
        projectId: project.id,
        key: 'failed',
        name: 'Failed',
        color: '#C8342F',
        icon: 'x',
        isFinal: true,
        countsAsFailure: true,
      },
    }),
    admin.resultStatus.create({
      data: {
        organizationId,
        projectId: project.id,
        key: 'passed',
        name: 'Passed',
        color: '#12805C',
        icon: 'check',
        isFinal: true,
        countsAsFailure: false,
      },
    }),
  ]);
  const suite = await admin.suite.create({
    data: { organizationId, projectId: project.id, name: 'Checkout' },
  });
  const section = await admin.section.create({
    data: {
      organizationId,
      projectId: project.id,
      suiteId: suite.id,
      name: 'Payments',
      path: `/${randomUUID()}`,
      depth: 0,
    },
  });
  const testCase = await admin.testCase.create({
    data: {
      organizationId,
      projectId: project.id,
      suiteId: suite.id,
      sectionId: section.id,
      caseNumber: 42,
    },
  });
  const version = await admin.testCaseVersion.create({
    data: {
      organizationId,
      testCaseId: testCase.id,
      version: 1,
      title: 'Card checkout completes',
      template: 'STEPS',
      preconditions: 'A customer has an item in the cart.',
      expectedResult: 'The order confirmation is displayed.',
      content: {
        steps: [
          { action: 'Enter valid card details', expected: 'Card details are accepted' },
          { action: 'Submit the order', expected: 'Order confirmation appears' },
        ],
      },
      createdById: userId,
    },
  });
  await admin.testCase.update({
    where: { organizationId_id: { organizationId, id: testCase.id } },
    data: { currentVersionId: version.id },
  });
  const run = await admin.testRun.create({
    data: {
      organizationId,
      projectId: project.id,
      name: 'Release regression',
      status: 'ACTIVE',
      build: 'build-42',
    },
  });
  const item = await admin.testRunItem.create({
    data: {
      organizationId,
      testRunId: run.id,
      caseVersionId: version.id,
      statusId: failedStatus.id,
    },
  });
  const evidence = Buffer.from('screenshot evidence');
  const uploadResponse = await app.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectSlug}/runs/${run.id}/items/${item.id}/uploads`,
    headers: { authorization: `Bearer ${organizationToken}` },
    payload: {
      fileName: 'checkout-failure.png',
      contentType: 'image/png',
      sizeBytes: evidence.byteLength,
      checksumSha256: createHash('sha256').update(evidence).digest('hex'),
      stepPosition: 1,
    },
  });
  const upload = createUploadSessionResponseSchema.parse(uploadResponse.json()).upload;
  const uploaded = await fetch(upload.url, {
    method: 'PUT',
    headers: upload.headers,
    body: evidence,
  });
  if (!uploaded.ok) throw new Error(`Could not prepare Jira evidence: ${await uploaded.text()}`);

  const resultResponse = await app.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectSlug}/runs/${run.id}/items/${item.id}/results`,
    headers: { authorization: `Bearer ${organizationToken}` },
    payload: {
      statusId: failedStatus.id,
      comment: 'The payment gateway returned HTTP 500.',
      stepResults: [
        { position: 0, statusId: failedStatus.id, comment: 'Card was accepted.' },
        { position: 1, statusId: failedStatus.id, comment: 'No confirmation appeared.' },
      ],
      uploadIds: [upload.id],
    },
  });
  const result = createTestResultResponseSchema.parse(resultResponse.json()).result;

  return {
    projectSlug,
    caseId: testCase.id,
    runId: run.id,
    itemId: item.id,
    resultId: result.id,
    attachmentId: result.attachments[0]?.id ?? '',
  };
}
