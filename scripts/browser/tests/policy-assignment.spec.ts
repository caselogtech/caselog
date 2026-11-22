import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createReleaseCandidateResponseSchema,
  createReleaseResponseSchema,
  organizationTokenResponseSchema,
  sessionResponseSchema,
} from '../../../packages/schemas/dist/index.js';
import {
  candidatePolicyAssignmentResponseSchema,
  readinessPolicyListResponseSchema,
} from '../../../packages/schemas/dist/readiness.js';

test('assign a published policy after visiting its catalogue and return to the catalogue', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill('demo@caselog.local');
  await page.getByLabel('Password', { exact: true }).fill('CaselogDemo123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/auth\/workspaces/);

  const signedIn = await request.post('/api/v1/auth/login', {
    data: { email: 'demo@caselog.local', password: 'CaselogDemo123!' },
  });
  expect(signedIn.ok()).toBeTruthy();
  const session = sessionResponseSchema.parse(await signedIn.json());
  const exchanged = await request.post('/api/v1/auth/organizations/acme/token', {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  expect(exchanged.ok()).toBeTruthy();
  const token = organizationTokenResponseSchema.parse(await exchanged.json());
  const headers = { authorization: `Bearer ${token.accessToken}` };
  const base = '/api/v1/projects/checkout';
  const listed = await request.get(`${base}/release-policies`, { headers });
  expect(listed.ok()).toBeTruthy();
  const policy = readinessPolicyListResponseSchema
    .parse(await listed.json())
    .items.find((item) => item.publishedVersion !== null);
  if (!policy) throw new Error('Missing published test policy');

  const createdRelease = await request.post(`${base}/releases`, {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: { key: `ASSIGN-${randomUUID().slice(0, 8)}`, name: 'Policy assignment regression' },
  });
  expect(createdRelease.ok(), await createdRelease.text()).toBeTruthy();
  const { release } = createReleaseResponseSchema.parse(await createdRelease.json());
  const createdCandidate = await request.post(`${base}/releases/${release.id}/candidates`, {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: { buildIdentifier: randomUUID() },
  });
  expect(createdCandidate.ok(), await createdCandidate.text()).toBeTruthy();
  const { candidate } = createReleaseCandidateResponseSchema.parse(await createdCandidate.json());

  await page.goto('/acme/checkout/release-policies');
  await expect(page.locator('app-policy-catalog')).toContainText(policy.name);
  // Keep the same application and query cache while navigating between the two views.
  await page.getByRole('link', { name: 'Releases', exact: true }).click();
  await page.getByRole('link', { name: release.name, exact: true }).click();
  await expect(page.getByRole('heading', { name: release.name, exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const viewCandidate = page.getByRole('link', {
    name: `View candidate ${candidate.label}`,
    exact: true,
  });
  await expect(viewCandidate).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await viewCandidate.click();
  await expect(page).toHaveURL(`/acme/checkout/releases/${release.id}/candidates/${candidate.id}`);
  await page.setViewportSize({ width: 1280, height: 900 });

  const assignment = page.locator('app-policy-assignment');
  await expect(
    assignment.getByRole('combobox', { name: 'Published policy', exact: true }),
  ).toBeVisible();
  await assignment
    .getByRole('combobox', { name: 'Published policy', exact: true })
    .selectOption(policy.id);
  const assigned = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/candidates/${candidate.id}/readiness-policy`) &&
      response.request().method() === 'PUT',
  );
  await assignment.getByRole('button', { name: 'Assign policy', exact: true }).click();
  const response = await assigned;
  expect(response.ok(), await response.text()).toBeTruthy();
  const { assignment: saved } = candidatePolicyAssignmentResponseSchema.parse(
    await response.json(),
  );
  expect(saved.policy.id).toBe(policy.id);
  expect(saved.policyVersion.id).toBe(policy.publishedVersion?.id);
  await expect(page.locator('app-readiness-summary')).toContainText(policy.name);

  await page.getByRole('link', { name: 'Release policies', exact: true }).click();
  await expect(page.locator('app-policy-catalog')).toContainText(policy.name);
  expect(errors).toEqual([]);
});
