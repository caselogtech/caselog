import { evidenceListResponseSchema } from '../../../packages/schemas/dist/evidence.js';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  sessionResponseSchema,
  testCaseListResponseSchema,
  testRunDetailResponseSchema,
} from '../../../packages/schemas/dist/index.js';
import { readinessPolicyResponseSchema } from '../../../packages/schemas/dist/readiness.js';

test.use({ actionTimeout: 15_000 });

test('author a custom gate, combine native tests with manual answers, attach reports and edit the policy', async ({
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
  const login = sessionResponseSchema.parse(
    await (
      await request.post('/api/v1/auth/login', {
        data: { email: 'demo@caselog.local', password: 'CaselogDemo123!' },
      })
    ).json(),
  );
  const exchanged = await request.post('/api/v1/auth/organizations/acme/token', {
    headers: { authorization: `Bearer ${login.accessToken}` },
  });
  const auth = { authorization: `Bearer ${(await exchanged.json()).accessToken}` };
  const headers = () => ({ ...auth, 'idempotency-key': randomUUID() });
  const base = '/api/v1/projects/checkout';
  await page.goto('/acme/checkout/release-policies/new');
  await page
    .getByRole('textbox', { name: 'Policy key', exact: true })
    .fill(`quality-${randomUUID().slice(0, 8)}`);
  await page.getByRole('textbox', { name: 'Policy name', exact: true }).fill('Production review');
  const gate = page.locator('app-policy-gate-editor article').first();
  await gate.getByRole('textbox', { name: 'Gate name', exact: true }).fill('Release quality');
  await gate
    .getByRole('textbox', { name: 'Gate description', exact: true })
    .fill('WCAG 2.2 AA and Lighthouse review');
  const editor = gate.locator('app-gate-form-definition-editor');
  const fields = editor.locator('section').nth(0).locator(':scope > fieldset');
  await fields
    .first()
    .getByRole('textbox', { name: 'Field label', exact: true })
    .fill('Keyboard navigation');
  for (const [label, type, required] of [
    ['Lighthouse score', 'number', true],
    ['Reports', 'files', true],
    ['Standard', 'text', true],
    ['Pages reviewed', 'textarea', true],
    ['Tools used', 'text', true],
    ['Notes', 'textarea', false],
  ] as const) {
    const fieldCount = await fields.count();
    await editor.getByRole('button', { name: 'Add field', exact: true }).click();
    await expect(fields).toHaveCount(fieldCount + 1);
    const field = fields.last();
    await field.getByRole('textbox', { name: 'Field label', exact: true }).fill(label);
    await field.getByRole('combobox', { name: 'Field type', exact: true }).selectOption(type);
    if (required)
      await field.getByRole('checkbox', { name: 'Required answer', exact: true }).check();
  }
  const conditions = editor.locator('section').nth(1).locator(':scope > fieldset');
  await editor.getByRole('button', { name: 'Add condition', exact: true }).click();
  await expect(conditions).toHaveCount(2);
  await conditions
    .last()
    .getByRole('combobox', { name: 'Minimum case priority', exact: true })
    .selectOption('medium');
  await editor.getByRole('button', { name: 'Add condition', exact: true }).click();
  await expect(conditions).toHaveCount(3);
  await conditions
    .last()
    .getByRole('combobox', { name: 'Condition type', exact: true })
    .selectOption('number');
  await conditions.last().getByRole('spinbutton', { name: 'Threshold', exact: true }).fill('90');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Create policy', exact: true }).click();
  await expect(page).toHaveURL(/\/release-policies\/[0-9a-f-]{36}$/);
  const policyId = page.url().split('/').at(-1);
  const path = `/acme/checkout/release-policies/${policyId}`;
  const apiPath = `${base}/release-policies/${policyId}`;
  await page.getByRole('link', { name: 'Edit policy', exact: true }).click();
  await conditions.last().getByRole('spinbutton', { name: 'Threshold', exact: true }).fill('95');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(path);
  await page.getByRole('button', { name: 'Publish draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish draft', exact: true })).toHaveCount(0);
  const published = readinessPolicyResponseSchema.parse(
    await (await request.get(apiPath, { headers: auth })).json(),
  );
  const publishedGate = published.policy.versions.find(({ state }) => state === 'published')
    ?.gates[0];
  expect(publishedGate?.form?.criteria).toMatchObject([
    { type: 'checkbox' },
    { type: 'test_results', minimumPriority: 'medium' },
    { type: 'number', expected: 95 },
  ]);

  // Complete every case before linking, so priority-scoped native coverage has no missing cases.
  const cases = testCaseListResponseSchema.parse(
    await (await request.get(`${base}/cases?limit=100`, { headers: auth })).json(),
  );
  expect(cases.nextCursor).toBeNull();
  const createdRun = await request.post(`${base}/runs`, {
    headers: headers(),
    data: { name: 'Custom gate native checks', caseIds: cases.items.map(({ id }) => id) },
  });
  expect(createdRun.ok(), await createdRun.text()).toBeTruthy();
  const runId = (await createdRun.json()).run.id;
  expect(
    (await request.post(`${base}/runs/${runId}/start`, { headers: headers(), data: {} })).ok(),
  ).toBeTruthy();
  const run = testRunDetailResponseSchema.parse(
    await (await request.get(`${base}/runs/${runId}?limit=100`, { headers: auth })).json(),
  );
  const passed = run.statuses.find(({ key }) => key === 'passed');
  if (!passed) throw new Error('Missing passed status');
  const results = await request.post(`${base}/runs/${runId}/results/bulk`, {
    headers: headers(),
    data: { results: run.items.map(({ id }) => ({ itemId: id, statusId: passed.id })) },
  });
  expect(results.ok(), await results.text()).toBeTruthy();
  expect(
    (await request.post(`${base}/runs/${runId}/close`, { headers: headers(), data: {} })).ok(),
  ).toBeTruthy();
  const release = await request.post(`${base}/releases`, {
    headers: headers(),
    data: { key: `FORM-${randomUUID().slice(0, 8)}`, name: 'Custom gate release' },
  });
  expect(release.ok(), await release.text()).toBeTruthy();
  const releaseId = (await release.json()).release.id;
  const candidate = await request.post(`${base}/releases/${releaseId}/candidates`, {
    headers: headers(),
    data: { sourceRevision: randomUUID() },
  });
  expect(candidate.ok(), await candidate.text()).toBeTruthy();
  const candidateId = (await candidate.json()).candidate.id;
  expect(
    (
      await request.put(`${base}/candidates/${candidateId}/readiness-policy`, {
        headers: headers(),
        data: { policyId },
      })
    ).ok(),
  ).toBeTruthy();
  const link = await request.put(`${base}/candidates/${candidateId}/test-runs/${runId}`, {
    headers: headers(),
    data: { role: 'required' },
  });
  expect(link.ok(), await link.text()).toBeTruthy();
  // Native materialization uses the existing scheduled worker. Establish its evidence
  // before testing the immediate evaluation triggered by each human response.
  await expect
    .poll(
      async () => {
        const evidence = evidenceListResponseSchema.parse(
          await (
            await request.get(
              `${base}/evidence?candidateId=${candidateId}&metricKey=test.pass_rate&producerKey=caselog.test-runs&currentOnly=true&limit=100`,
              { headers: auth },
            )
          ).json(),
        );
        return evidence.items.some(
          (item) =>
            item.dimensions.minimumPriority === 'medium' &&
            item.dimensions.testRunRole === 'required' &&
            item.state === 'available' &&
            item.value.value === '100',
        );
      },
      { timeout: 90_000 },
    )
    .toBe(true);

  await page.goto(`/acme/checkout/releases/${releaseId}/candidates/${candidateId}`);
  const panel = page.locator('app-gate-form-response');
  const form = panel.locator('form');
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Save response', exact: true }).click();
  await expect(
    panel.getByRole('alert').filter({ hasText: 'Complete the required fields' }),
  ).toBeVisible();
  await form.getByRole('textbox', { name: 'Standard', exact: true }).fill('WCAG 2.2 AA');
  await form
    .getByRole('textbox', { name: 'Pages reviewed', exact: true })
    .fill('https://example.com/checkout');
  await form
    .getByRole('textbox', { name: 'Tools used', exact: true })
    .fill('Lighthouse, axe, NVDA');
  await form.getByRole('spinbutton', { name: 'Lighthouse score', exact: true }).fill('96');
  await form.getByLabel('Reports', { exact: false }).setInputFiles({
    name: 'quality-report.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"violations":[],"score":96}'),
  });
  await expect(
    form.getByRole('button', { name: 'quality-report.json', exact: true }),
  ).toBeVisible();
  await form.getByRole('button', { name: 'Save response', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Response recorded');
  const readinessUrl = `${base}/candidates/${candidateId}/readiness`;
  const status = async () => {
    const data = await (await request.get(readinessUrl, { headers: auth })).json();
    return data.state === 'current' ? data.decision?.status : data.state;
  };
  await expect.poll(status, { timeout: 20_000 }).toBe('blocked');
  await form.getByRole('checkbox', { name: 'Keyboard navigation', exact: true }).check();
  await form.getByRole('button', { name: 'Save response', exact: true }).click();
  await expect.poll(status, { timeout: 20_000 }).toBe('ready');
  const decision = (await (await request.get(readinessUrl, { headers: auth })).json()).decision;
  expect(
    decision.gates[0].criteria.every(
      (criterion: { result: string }) => criterion.result === 'passed',
    ),
  ).toBe(true);
  await panel.locator('summary').click();
  await expect(panel.locator('article')).toHaveCount(2);
  await expect(panel.locator('article').last()).toContainText('Superseded response');
  const downloadPromise = page.waitForEvent('download');
  await form.getByRole('button', { name: 'quality-report.json', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('quality-report.json');
  expect(await download.failure()).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
