import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createReleaseResponseSchema,
  environmentListResponseSchema,
  releaseDetailResponseSchema,
  updateReleaseResponseSchema,
} from '../../../packages/schemas/dist/index.js';
import { readinessDecisionListResponseSchema } from '../../../packages/schemas/dist/readiness.js';

test('edit a release without an environment, resolve a conflict and preserve candidate history', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill('demo@caselog.local');
  await page.getByLabel('Password', { exact: true }).fill('CaselogDemo123!');
  const signedIn = page.waitForResponse(
    (response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect((await signedIn).ok()).toBeTruthy();
  await expect(page).toHaveURL(/auth\/workspaces/);
  // Model another client with its own session: browser refresh rotates its session.
  const apiLogin = await request.post('/api/v1/auth/login', {
    data: { email: 'demo@caselog.local', password: 'CaselogDemo123!' },
  });
  expect(apiLogin.ok(), await apiLogin.text()).toBeTruthy();
  const login = await apiLogin.json();
  const exchange = await request.post('/api/v1/auth/organizations/acme/token', {
    headers: { authorization: `Bearer ${login.accessToken}` },
  });
  expect(exchange.ok()).toBeTruthy();
  const headers = { authorization: `Bearer ${(await exchange.json()).accessToken}` };
  const base = '/api/v1/projects/checkout';
  const created = await request.post(`${base}/releases`, {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: { key: `edit-${randomUUID().slice(0, 8)}`, name: 'No environment yet' },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const release = createReleaseResponseSchema.parse(await created.json()).release;
  const environments = await request.get(`${base}/environments`, { headers });
  const environment = environmentListResponseSchema
    .parse(await environments.json())
    .items.find((item) => item.state === 'active');
  expect(environment).toBeDefined();
  if (!environment) throw new Error('Missing active environment');
  const path = `/acme/checkout/releases/${release.id}`;
  await page.goto(path);
  await page.getByRole('link', { name: 'Edit release', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Release name', exact: true })).toHaveValue(
    release.name,
  );
  await expect(page.getByLabel('Environment', { exact: true })).toHaveValue('');
  await page
    .getByRole('textbox', { name: 'Release name', exact: true })
    .fill('Release with environment');
  await page.getByLabel('Environment', { exact: true }).selectOption(environment.id);
  await page.getByLabel('Target date', { exact: true }).fill('2026-12-10');
  await page.getByLabel('External reference', { exact: true }).fill('QA-EDIT');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Release with environment');
  await expect(page.getByText(environment.name, { exact: true }).first()).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: 'Edit release', exact: true }).click();
  await expect(page.getByLabel('Environment', { exact: true })).toHaveValue(environment.id);
  await expect(page.getByLabel('Target date', { exact: true })).toHaveValue('2026-12-10');
  await expect(page.getByLabel('External reference', { exact: true })).toHaveValue('QA-EDIT');
  await page.getByRole('textbox', { name: 'Release name', exact: true }).fill('My unsaved edit');
  const currentResponse = await request.get(`${base}/releases/${release.id}`, { headers });
  expect(currentResponse.ok(), await currentResponse.text()).toBeTruthy();
  const current = releaseDetailResponseSchema.parse(await currentResponse.json()).release;
  const parallel = await request.put(`${base}/releases/${release.id}`, {
    headers,
    data: {
      name: 'Edited in another tab',
      environmentId: environment.id,
      targetDate: current.targetDate,
      externalReference: current.externalReference,
      expectedUpdatedAt: current.updatedAt,
    },
  });
  expect(parallel.ok(), await parallel.text()).toBeTruthy();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This release changed');
  await expect(page.getByRole('textbox', { name: 'Release name', exact: true })).toHaveValue(
    'My unsaved edit',
  );
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page
    .getByRole('button', { name: 'Reload release and discard my edits', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Release name', exact: true })).toHaveValue(
    'Edited in another tab',
  );
  await expect(page.getByRole('textbox', { name: 'Release name', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Release name', exact: true }).fill('Reviewed release');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(path);
  const cancelled = await request.post(`${base}/releases/${release.id}/cancel`, { headers });
  expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reviewed release');
  await expect(page.getByRole('link', { name: 'Edit release', exact: true })).toHaveCount(0);
  await page.goto(`${path}/edit`);
  await expect(page.getByText('Release editing is unavailable', { exact: true })).toBeVisible();

  // The browser runner owns an isolated seeded database, never the user's workspace.
  const seeded = await request.get(`${base}/releases/00000000-0000-4000-8000-000000000411`, {
    headers,
  });
  const before = releaseDetailResponseSchema.parse(await seeded.json());
  const candidate = before.candidates.find((item) => item.sequence === 2);
  if (!candidate) throw new Error('Missing seeded candidate');
  const historyUrl = `${base}/candidates/${candidate.id}/readiness/decisions`;
  const history = await request.get(historyUrl, { headers });
  expect(history.ok()).toBeTruthy();
  const decisions = readinessDecisionListResponseSchema.parse(await history.json());
  expect(decisions.items.length).toBeGreaterThan(0);
  const updated = await request.put(`${base}/releases/${before.release.id}`, {
    headers,
    data: {
      name: 'Corrected release context',
      environmentId: null,
      targetDate: before.release.targetDate,
      externalReference: before.release.externalReference,
      expectedUpdatedAt: before.release.updatedAt,
    },
  });
  expect(updated.ok(), await updated.text()).toBeTruthy();
  expect(updateReleaseResponseSchema.parse(await updated.json()).release.key).toBe(
    before.release.key,
  );
  const after = await request.get(`${base}/releases/${before.release.id}`, { headers });
  const detail = releaseDetailResponseSchema.parse(await after.json());
  expect(detail.candidates).toEqual(before.candidates);
  expect(detail.history).toEqual(before.history);
  expect(await (await request.get(historyUrl, { headers })).json()).toEqual(decisions);
  expect(errors).toEqual([]);
});
