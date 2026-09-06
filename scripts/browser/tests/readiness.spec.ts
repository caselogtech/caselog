import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const execute = promisify(execFile);
const releaseId = '00000000-0000-4000-8000-000000000411';
const policyId = '00000000-0000-4000-8000-000000000501';

test('CI evidence reaches the browser; a waiver preserves the failed decision and history', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill('demo@caselog.local');
  await page.getByLabel('Password', { exact: true }).fill('CaselogDemo123!');
  const loginResponse = page.waitForResponse(
    (response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const login = await (await loginResponse).json();
  await expect(page).toHaveURL(/auth\/workspaces/);
  const exchange = await request.post('/api/v1/auth/organizations/acme/token', {
    headers: { authorization: `Bearer ${login.accessToken}` },
  });
  expect(exchange.ok()).toBeTruthy();
  const headers = {
    authorization: `Bearer ${(await exchange.json()).accessToken}`,
    'idempotency-key': randomUUID(),
  };
  const issued = await request.post('/api/v1/api-tokens', {
    headers,
    data: {
      name: 'Browser pipeline',
      scopes: ['candidates:write', 'results:write', 'readiness:read', 'readiness:write'],
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    },
  });
  expect(issued.ok()).toBeTruthy();
  const apiToken = (await issued.json()).token;
  const runResponse = await request.post('/api/v1/projects/checkout/runs', {
    headers,
    data: {
      name: 'Browser CI run',
      caseIds: ['00000000-0000-4000-8000-000000000101'],
    },
  });
  expect(runResponse.ok(), await runResponse.text()).toBeTruthy();
  const runId = (await runResponse.json()).run.id;
  const secondRun = await request.post('/api/v1/projects/checkout/runs', {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: {
      name: 'Regression confirmation',
      caseIds: ['00000000-0000-4000-8000-000000000101'],
    },
  });
  expect(secondRun.ok(), await secondRun.text()).toBeTruthy();
  const secondRunId = (await secondRun.json()).run.id;
  const directory = await mkdtemp(resolve(tmpdir(), 'caselog-browser-junit-'));
  async function cli(args: string[]) {
    try {
      const result = await execute(
        process.execPath,
        [resolve('apps/cli/dist/cli.js'), ...args, '--project', 'checkout', '--json'],
        {
          timeout: 100_000,
          env: {
            ...process.env,
            CASELOG_TOKEN: apiToken,
            CASELOG_API_URL: 'http://127.0.0.1:4317/api/v1',
          },
        },
      );
      return { code: 0, body: JSON.parse(result.stdout) };
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('stdout' in error) ||
        typeof error.stdout !== 'string'
      )
        throw error;
      return { code: 'code' in error ? error.code : 2, body: JSON.parse(error.stdout) };
    }
  }
  try {
    const candidate = await cli([
      'candidate',
      'create',
      '--release',
      releaseId,
      '--build',
      randomUUID(),
      '--commit',
      'browser-smoke',
    ]);
    expect(candidate.code, JSON.stringify(candidate.body)).toBe(0);
    const candidateId = candidate.body.data.id;
    expect(
      (await cli(['readiness', 'assign', '--candidate', candidateId, '--policy', policyId])).code,
    ).toBe(0);
    const xml = resolve(directory, 'results.xml');
    const report = (failed: boolean) =>
      `<testsuite name="smoke"><testcase name="login"><properties><property name="caselog.case_number" value="1" /></properties>${failed ? '<failure message="Known regression" />' : ''}</testcase></testsuite>`;
    await writeFile(xml, report(false));
    const ingestion = await cli([
      'upload',
      '--run',
      runId,
      '--candidate',
      candidateId,
      '--fail-on-unmatched',
      xml,
    ]);
    expect(ingestion.code, JSON.stringify(ingestion.body)).toBe(0);
    expect(ingestion.body.recorded).toBe(1);
    expect((await cli(['run', 'close', '--run', runId])).code).toBe(0);
    const ready = await cli([
      'readiness',
      'evaluate',
      '--candidate',
      candidateId,
      '--wait',
      '--timeout',
      '90',
      '--poll-interval',
      '1',
    ]);
    expect(ready.code, JSON.stringify(ready.body)).toBe(0);
    expect(ready.body.data.decision.status).toBe('ready');
    const candidatePath = `/acme/checkout/releases/${releaseId}/candidates/${candidateId}`;
    await page.goto(candidatePath);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('RC');
    await expect(page.locator('app-readiness-summary')).toContainText('Ready');
    await expect(page.locator('app-readiness-summary')).toContainText('Current');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });

    await writeFile(xml, report(true));
    expect(
      (await cli(['upload', '--run', secondRunId, '--candidate', candidateId, xml])).code,
    ).toBe(0);
    expect((await cli(['run', 'close', '--run', secondRunId])).code).toBe(0);
    const readinessUrl = `/api/v1/projects/checkout/candidates/${candidateId}/readiness`;
    await expect
      .poll(
        async () => {
          const response = await request.get(readinessUrl, {
            headers: { authorization: `Bearer ${apiToken}` },
          });
          const data = await response.json();
          return data.state === 'current' ? data.decision?.status : data.state;
        },
        { timeout: 130_000, intervals: [500, 1000, 2000] },
      )
      .toBe('blocked');
    const blocked = await cli(['readiness', 'check', '--candidate', candidateId]);
    expect(blocked.code).toBe(1);
    const decisionId = blocked.body.data.decision.id;
    expect(decisionId).not.toBe(ready.body.data.decision.id);
    await page.reload();
    await expect(page.locator('app-readiness-summary')).toContainText('Blocked');
    await page.locator(`a[href$="/decisions/${decisionId}"]`).first().click();
    await page
      .getByLabel('Reason', { exact: false })
      .first()
      .fill('Accept the known regression for this isolated browser test');
    await page.getByRole('button', { name: 'Create waiver', exact: true }).click();
    await expect(page.getByText('Approved with waiver', { exact: true }).first()).toBeVisible();
    const waived = await cli(['readiness', 'check', '--candidate', candidateId]);
    expect(waived.code, JSON.stringify(waived.body)).toBe(0);
    expect(waived.body.data.decision.status).toBe('blocked');
    expect(waived.body.data.decision.id).toBe(decisionId);
    const historical = await request.get(
      `/api/v1/projects/checkout/readiness-decisions/${ready.body.data.decision.id}`,
      { headers: { authorization: `Bearer ${apiToken}` } },
    );
    expect((await historical.json()).decision.status).toBe('ready');
    await page.reload();
    await expect(page.getByText('Approved with waiver', { exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
