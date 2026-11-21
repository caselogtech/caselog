import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  sessionResponseSchema,
  testCaseDetailResponseSchema,
  createTestCaseResponseSchema,
} from '../../../packages/schemas/dist/index.js';
import { readinessPolicyResponseSchema } from '../../../packages/schemas/dist/readiness.js';

test.use({ actionTimeout: 15_000 });

test('configure test priority, WCAG and Lighthouse gates and edit the saved policy', async ({
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
  const login = sessionResponseSchema.parse(await signedIn.json());
  const exchanged = await request.post('/api/v1/auth/organizations/acme/token', {
    headers: { authorization: `Bearer ${login.accessToken}` },
  });
  expect(exchanged.ok()).toBeTruthy();
  const headers = {
    authorization: `Bearer ${(await exchanged.json()).accessToken}`,
    'idempotency-key': randomUUID(),
  };
  const policyBase = '/api/v1/projects/checkout/release-policies';
  const template = readinessPolicyResponseSchema.parse(
    await (
      await request.get(`${policyBase}/00000000-0000-4000-8000-000000000501`, { headers })
    ).json(),
  );
  const templateVersion = template.policy.versions.find((version) => version.state === 'published');
  if (!templateVersion) throw new Error('Missing policy template');
  const created = await request.post(policyBase, {
    headers,
    data: {
      key: `quality-browser-${randomUUID().slice(0, 8)}`,
      name: 'Quality browser baseline',
      gates: templateVersion.gates.map(({ id: _id, position: _position, ...gate }) => gate),
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const policyId = readinessPolicyResponseSchema.parse(await created.json()).policy.id;
  const initialPublication = await request.post(`${policyBase}/${policyId}/publish`, {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: {},
  });
  expect(initialPublication.ok(), await initialPublication.text()).toBeTruthy();
  const apiPath = `/api/v1/projects/checkout/release-policies/${policyId}`;
  const path = `/acme/checkout/release-policies/${policyId}`;
  const original = readinessPolicyResponseSchema.parse(
    await (await request.get(apiPath, { headers })).json(),
  );
  await page.goto(path);
  await page.getByRole('link', { name: 'Edit policy', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Policy name', exact: true })
    .fill('Production readiness');
  const articles = page.locator('app-policy-gate-editor article');
  for (let index = 0; index < 2; index++) {
    const gate = articles.nth(index);
    await gate
      .getByRole('combobox', { name: 'Minimum case priority', exact: true })
      .selectOption('medium');
    await gate.locator('input[formControlName="expectedValue"]').fill('100');
    await gate.locator('select[formControlName="staleEvidenceBehavior"]').selectOption('block');
  }
  for (const [key, metric] of [
    ['wcag-automated', 'accessibility.wcag22_aa_violations'],
    ['wcag-manual', 'accessibility.wcag22_aa_manual_review'],
    ['lighthouse', 'performance.lighthouse_score'],
  ] as const) {
    const count = await articles.count();
    await page.getByRole('button', { name: 'Add gate', exact: true }).click();
    await expect(articles).toHaveCount(count + 1);
    const gate = articles.nth(count);
    await gate.locator('input[formControlName="key"]').fill(key);
    await gate.getByRole('combobox', { name: 'Metric', exact: true }).selectOption(metric);
    await gate
      .getByRole('textbox', { name: 'Measurement profile', exact: true })
      .fill('production-mobile-v1');
    await gate.getByRole('button', { name: 'Use my account', exact: true }).click();
    await gate
      .getByRole('textbox', { name: 'Required page URLs', exact: true })
      .fill('https://example.com/\nhttps://example.com/checkout');
    await gate
      .getByRole('textbox', { name: 'Tool or review procedure version', exact: true })
      .fill('ci-review-v1');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(path);
  const saved = readinessPolicyResponseSchema.parse(
    await (await request.get(apiPath, { headers })).json(),
  ).policy;
  const draft = saved.versions.find((version) => version.state === 'draft');
  expect(draft?.gates).toHaveLength(5);
  expect(saved.versions.find((version) => version.state === 'published')).toEqual(
    original.policy.versions.find((version) => version.state === 'published'),
  );
  expect(draft?.gates[0]?.dimensions.minimumPriority).toBe('medium');
  expect(draft?.gates.find((gate) => gate.key === 'lighthouse')).toMatchObject({
    expected: { type: 'percentage', value: '90' },
    producerKey: login.user.id,
    dimensions: {
      device: 'mobile',
      runsPerPage: 3,
      pageUrls: ['https://example.com/', 'https://example.com/checkout'],
    },
  });
  await page.getByRole('link', { name: 'Edit policy', exact: true }).click();
  await expect(articles).toHaveCount(5);
  await expect(
    articles.last().getByRole('textbox', { name: 'Required page URLs', exact: true }),
  ).toHaveValue('https://example.com/\nhttps://example.com/checkout');
  await articles.last().locator('input[formControlName="expectedValue"]').fill('95');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(path);
  await page.getByRole('button', { name: 'Publish draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish draft', exact: true })).toHaveCount(0);
  const published = readinessPolicyResponseSchema.parse(
    await (await request.get(apiPath, { headers })).json(),
  ).policy;
  expect(
    published.versions
      .find((version) => version.state === 'published')
      ?.gates.find((gate) => gate.key === 'lighthouse')?.expected.value,
  ).toBe('95');

  const caseTemplate = testCaseDetailResponseSchema.parse(
    await (
      await request.get('/api/v1/projects/checkout/cases/00000000-0000-4000-8000-000000000101', {
        headers,
      })
    ).json(),
  );
  const createdCase = await request.post('/api/v1/projects/checkout/cases', {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: {
      sectionId: caseTemplate.testCase.section.id,
      title: 'Quality browser priority',
      template: 'text',
      priority: 'medium',
      content: { text: 'Verify the versioned priority' },
    },
  });
  expect(createdCase.ok(), await createdCase.text()).toBeTruthy();
  const caseId = createTestCaseResponseSchema.parse(await createdCase.json()).testCase.id;
  await page.goto(`/acme/checkout/cases/${caseId}`);
  await page.getByRole('button', { name: 'Edit test case', exact: true }).click();
  await page.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('critical');
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await expect(page.getByText('Priority: Critical', { exact: true })).toBeVisible();
  const detail = testCaseDetailResponseSchema.parse(
    await (await request.get(`/api/v1/projects/checkout/cases/${caseId}`, { headers })).json(),
  );
  expect(detail.testCase.currentVersion.priority).toBe('critical');
  expect(errors).toEqual([]);
});
