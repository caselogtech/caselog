import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createWorkspaceResponseSchema,
  sessionResponseSchema,
  staffWorkspaceDetailResponseSchema,
  staffUserDetailResponseSchema,
  staffWorkspaceListResponseSchema,
  staffAuditLogListResponseSchema,
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
  await expect(page).toHaveURL(new RegExp(`/staff/workspaces/${workspace.id}(?:[?]|$)`));
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
  const owner = snapshot.workspace.owner;
  if (!owner) throw new Error('Expected the newly created workspace owner');
  await page.getByRole('link', { name: owner.displayName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/staff/users/${owner.userId}(?:[?]|$)`));
  await expect(page.getByRole('heading', { name: owner.displayName, exact: true })).toBeVisible();
  const userResponse = await request.get(`/api/v1/staff/users/${owner.userId}`, { headers });
  expect(userResponse.ok()).toBeTruthy();
  const customer = staffUserDetailResponseSchema.parse(await userResponse.json());
  expect(
    customer.workspaces.some((item) => item.id === workspace.id && item.role === 'owner'),
  ).toBe(true);
  await expect(page.getByRole('link', { name: workspace.name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.cache/staff-user-preview.png', fullPage: true });
  await page.getByRole('link', { name: workspace.name, exact: true }).click();
  await expect(page.getByRole('heading', { name: workspace.name, exact: true })).toBeVisible();
  await page.goto('/staff/users');
  await page.getByLabel('Search this directory', { exact: true }).fill(owner.email);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page
    .getByRole('row')
    .filter({ hasText: owner.email })
    .getByRole('link', { name: owner.displayName, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/staff/users/${owner.userId}(?:[?]|$)`));
  await page.goto(`/staff/users/${randomUUID()}`);
  await expect(page.locator('main')).toContainText('This user no longer exists');
  await page.getByRole('link', { name: 'Back to users', exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/users$/);
  await page.goto(`/staff/workspaces/${randomUUID()}`);
  await expect(page.locator('main')).toContainText('This workspace no longer exists');
  await page.getByRole('link', { name: 'Back to workspaces', exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/workspaces$/);
  expect(errors).toEqual([]);
});

test('directory URLs preserve filters, cursor and browser navigation through cards', async ({
  page,
  request,
}) => {
  test.skip(process.env.CASELOG_DEPLOYMENT_MODE !== 'managed', 'Requires isolated managed mode');
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill('demo@caselog.local');
  await page.getByLabel('Password', { exact: true }).fill('CaselogDemo123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/auth\/workspaces/);
  const login = await request.post('/api/v1/auth/login', {
    data: { email: 'demo@caselog.local', password: 'CaselogDemo123!' },
  });
  const session = sessionResponseSchema.parse(await login.json());
  const headers = { authorization: `Bearer ${session.accessToken}` };
  const suffix = randomUUID().slice(0, 8);
  for (const ending of ['a', 'b']) {
    const created = await request.post('/api/v1/auth/workspaces', {
      headers,
      data: { name: `Directory ${suffix} ${ending}`, slug: `directory-${suffix}-${ending}` },
    });
    expect(created.ok()).toBeTruthy();
  }
  const listing = await request.get(`/api/v1/staff/workspaces?q=${suffix}&state=current&limit=1`, {
    headers,
  });
  expect(listing.ok()).toBeTruthy();
  const first = staffWorkspaceListResponseSchema.parse(await listing.json());
  const workspace = first.workspaces[0];
  if (!workspace || !first.nextCursor) throw new Error('Expected two directory fixtures');
  const firstUrl = `/staff/workspaces?q=${suffix}&state=current&limit=1`;
  const secondUrl = `${firstUrl}&cursor=${first.nextCursor}`;
  await page.goto(firstUrl);
  await expect(page.getByRole('link', { name: workspace.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`cursor=${first.nextCursor}`));
  const secondLink = page.locator('tbody tr td:first-child a');
  await expect(secondLink).toHaveCount(1);
  await expect(secondLink).not.toHaveText(workspace.name);
  await page.goBack();
  await expect(page.getByRole('link', { name: workspace.name, exact: true })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`cursor=${first.nextCursor}`));
  await page.locator('tbody tr td:first-child a').click();
  await page.getByRole('link', { name: 'Demo Owner', exact: true }).click();
  await page.getByRole('link', { name: 'Back to directory', exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:4317${secondUrl}`);
  await expect(page.getByLabel('Search this directory', { exact: true })).toHaveValue(suffix);
  await expect(page.getByLabel('Workspace state', { exact: true })).toHaveValue('current');
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:4317${firstUrl}`);
  await page.goto(secondUrl);
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'First page', exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:4317${firstUrl}`);
});

test('owners filter the immutable staff audit and retain filters through pagination and reload', async ({
  page,
  request,
}) => {
  test.skip(process.env.CASELOG_DEPLOYMENT_MODE !== 'managed', 'Requires isolated managed mode');
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill('demo@caselog.local');
  await page.getByLabel('Password', { exact: true }).fill('CaselogDemo123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/auth\/workspaces/);
  const login = await request.post('/api/v1/auth/login', {
    data: { email: 'demo@caselog.local', password: 'CaselogDemo123!' },
  });
  const session = sessionResponseSchema.parse(await login.json());
  const headers = { authorization: `Bearer ${session.accessToken}` };
  // This journey can also run alone: bootstrap only the disposable database's seeded owner.
  expect((await request.get('/api/v1/staff/session', { headers })).ok()).toBeTruthy();
  const suffix = randomUUID().slice(0, 8);
  for (const ending of ['first', 'second']) {
    const grant = await request.post('/api/v1/staff/operators', {
      headers,
      data: {
        email: session.user.email,
        role: 'owner',
        accessExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
        reason: `Audit browser ${suffix} ${ending}`,
      },
    });
    expect(grant.ok()).toBeTruthy();
  }
  const fromInstant = new Date(Date.now() - 3_600_000);
  const toInstant = new Date(Date.now() + 3_600_000);
  // Cover fractional seconds that native inputs normalize by dropping trailing zeros.
  fromInstant.setUTCMilliseconds(350);
  toInstant.setUTCMilliseconds(350);
  const from = fromInstant.toISOString();
  const to = toInstant.toISOString();
  const params = new URLSearchParams({
    q: session.user.email,
    action: 'staff.operator.granted',
    targetType: 'staff_operator',
    targetId: session.user.id,
    from,
    to,
    limit: '1',
  });
  const firstResponse = await request.get(`/api/v1/staff/audit-logs?${params}`, { headers });
  expect(firstResponse.ok()).toBeTruthy();
  const first = staffAuditLogListResponseSchema.parse(await firstResponse.json());
  const firstEvent = first.auditLogs[0];
  if (!firstEvent?.reason || !first.nextCursor) throw new Error('Expected two audited grants');
  await page.goto('/staff/audit?limit=1');
  await page.getByLabel('Operator name or email', { exact: true }).fill(session.user.email);
  await page.getByLabel('Action (exact)', { exact: true }).fill('staff.operator.granted');
  await page.getByLabel('Target type (exact)', { exact: true }).fill('staff_operator');
  await page.getByLabel('Target ID (exact)', { exact: true }).fill(session.user.id);
  await page.getByLabel('From (UTC, inclusive)', { exact: true }).fill(dateTimeInputValue(from));
  await page.getByLabel('Until (UTC, exclusive)', { exact: true }).fill(dateTimeInputValue(to));
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page).toHaveURL(/action=staff.operator.granted/);
  await expect(page.locator('.audit-list')).toContainText(firstEvent.reason);
  await expect(page.locator('.audit-list time')).toContainText('UTC');
  expect(new URL(page.url()).searchParams.get('from')).toBe(from);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`cursor=${first.nextCursor}`));
  await expect(page.locator('.audit-list')).not.toContainText(firstEvent.reason);
  await page.reload();
  await expect(page.getByLabel('Operator name or email', { exact: true })).toHaveValue(
    session.user.email,
  );
  await expect(page.getByLabel('Action (exact)', { exact: true })).toHaveValue(
    'staff.operator.granted',
  );
  await page.getByRole('button', { name: 'First page', exact: true }).click();
  await expect(page.locator('.audit-list')).toContainText(firstEvent.reason);
  const appliedUrl = page.url();
  await page.getByLabel('From (UTC, inclusive)', { exact: true }).fill(dateTimeInputValue(to));
  await page.getByLabel('Until (UTC, exclusive)', { exact: true }).fill(dateTimeInputValue(from));
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Until later than From');
  expect(page.url()).toBe(appliedUrl);
  await page.getByLabel('From (UTC, inclusive)', { exact: true }).fill('');
  await page.getByLabel('Until (UTC, exclusive)', { exact: true }).fill('');
  await page.getByLabel('Action (exact)', { exact: true }).fill(`missing.${suffix}`);
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.locator('.audit-list')).toContainText('No staff audit events match');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/audit$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.audit-list')).toContainText(`Audit browser ${suffix}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.cache/staff-audit-preview.png', fullPage: true });
});

function dateTimeInputValue(instant: string): string {
  return instant
    .replace(/Z$/, '')
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '')
    .replace(/:00$/, '');
}
