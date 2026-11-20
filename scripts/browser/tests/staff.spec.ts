import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createWorkspaceResponseSchema,
  sessionResponseSchema,
  staffWorkspaceDetailResponseSchema,
} from '../../../packages/schemas/dist/index.js';

test('managed operators discover workspace contacts and inspect resource snapshots', async ({
  page,
  request,
}) => {
  test.skip(process.env.CASELOG_DEPLOYMENT_MODE !== 'managed', 'Requires isolated managed mode');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill('demo@caselog.local');
  await page.getByLabel('Password', { exact: true }).fill('CaselogDemo123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/auth\/workspaces/);
  const login = await request.post('/api/v1/auth/login', {
    data: { email: 'demo@caselog.local', password: 'CaselogDemo123!' },
  });
  expect(login.ok()).toBeTruthy();
  const session = sessionResponseSchema.parse(await login.json());
  const headers = { authorization: `Bearer ${session.accessToken}` };
  const slug = `customer-${randomUUID().slice(0, 8)}`;
  const created = await request.post('/api/v1/auth/workspaces', {
    headers,
    data: { name: `Customer ${slug}`, slug },
  });
  expect(created.ok()).toBeTruthy();
  const { workspace } = createWorkspaceResponseSchema.parse(await created.json());
  await page.goto('/staff');
  await page.getByRole('link', { name: 'Browse workspaces', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspaces', exact: true })).toBeVisible();
  await page.getByLabel('Search this directory', { exact: true }).fill(slug);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: workspace.name });
  await expect(row).toContainText('demo@caselog.local');
  await row.getByRole('link', { name: workspace.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/staff/workspaces/${workspace.id}$`));
  await expect(page.getByRole('heading', { name: workspace.name, exact: true })).toBeVisible();
  const response = await request.get(`/api/v1/staff/workspaces/${workspace.id}`, { headers });
  expect(response.ok()).toBeTruthy();
  const snapshot = staffWorkspaceDetailResponseSchema.parse(await response.json());
  await expect(page.getByRole('link', { name: 'demo@caselog.local', exact: true })).toHaveAttribute(
    'href',
    'mailto:demo@caselog.local',
  );
  await expect(page.locator('main')).toContainText('No billing account');
  await expect(page.locator('main')).toContainText('Snapshot from');
  const cases = page.locator('.metric-grid article').filter({ hasText: 'Current test cases' });
  await expect(cases.locator('strong')).toHaveText(String(snapshot.usage.testCases));
  const refreshed = page.waitForResponse(
    (value) => value.url().endsWith(`/api/v1/staff/workspaces/${workspace.id}`) && value.ok(),
  );
  await page.getByRole('button', { name: 'Refresh usage', exact: true }).click();
  await refreshed;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: workspace.name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.cache/staff-workspace-preview.png', fullPage: true });
  await page.goto(`/staff/workspaces/${randomUUID()}`);
  await expect(page.locator('main')).toContainText('This workspace no longer exists');
  await page.getByRole('link', { name: 'Back to workspaces', exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/workspaces$/);
  expect(errors).toEqual([]);
});
