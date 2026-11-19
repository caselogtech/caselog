import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { expect, test } from '@playwright/test';
import {
  createApiTokenResponseSchema,
  createProjectResponseSchema,
  createReleaseResponseSchema,
  createReleaseCandidateResponseSchema,
  createTestCaseResponseSchema,
  projectListResponseSchema,
  projectStructureResponseSchema,
  testCaseDetailResponseSchema,
  testCaseListResponseSchema,
  updateTestCaseResponseSchema,
} from '../../../packages/schemas/dist/index.js';
import {
  readinessPolicyResponseSchema,
  readinessPolicyListResponseSchema,
  candidateReadinessResponseSchema,
} from '../../../packages/schemas/dist/readiness.js';

test('stdio agents author cases and policies through the API and the browser sees the same records', async ({
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
  // Browser navigation rotates its session. Keep token administration in an independent API session.
  const apiLogin = await request.post('/api/v1/auth/login', {
    data: { email: 'demo@caselog.local', password: 'CaselogDemo123!' },
  });
  expect(apiLogin.ok()).toBeTruthy();
  const login = await apiLogin.json();
  const exchange = await request.post('/api/v1/auth/organizations/acme/token', {
    headers: { authorization: `Bearer ${login.accessToken}` },
  });
  expect(exchange.ok()).toBeTruthy();
  const workspaceHeaders = { authorization: `Bearer ${(await exchange.json()).accessToken}` };
  const suffix = randomUUID().slice(0, 8);
  const projectSlug = `mcp-${suffix}`;
  // Each browser journey owns its project; authoring must not alter another journey's fixtures.
  const projectResponse = await request.post('/api/v1/projects', {
    headers: workspaceHeaders,
    data: {
      name: 'MCP browser project',
      key: `MCP${suffix.toUpperCase()}`,
      slug: projectSlug,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  createProjectResponseSchema.parse(await projectResponse.json());
  const issued = await request.post('/api/v1/api-tokens', {
    headers: workspaceHeaders,
    data: {
      name: 'MCP browser journey',
      scopes: [
        'projects:read',
        'cases:read',
        'cases:write',
        'policies:read',
        'policies:write',
        'policies:publish',
        'readiness:read',
      ],
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
  });
  expect(issued.ok()).toBeTruthy();
  const credential = createApiTokenResponseSchema.parse(await issued.json());
  const client = new Client({ name: 'caselog-browser-agent', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('apps/mcp/dist/main.js')],
    stderr: 'pipe',
    env: {
      CASELOG_API_URL: `http://127.0.0.1:${process.env.API_PORT ?? '3137'}/api/v1`,
      CASELOG_TOKEN: credential.token,
    },
  });
  let diagnostics = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    diagnostics += chunk.toString();
  });
  async function call(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true);
    return result.structuredContent;
  }
  try {
    await client.connect(transport);
    expect((await client.listTools()).tools).toHaveLength(12);
    const projects = projectListResponseSchema.parse(await call('list_projects', {}));
    expect(projects.items.some((project) => project.slug === projectSlug)).toBe(true);
    const structure = projectStructureResponseSchema.parse(
      await call('get_project_structure', { projectSlug }),
    );
    const sectionId = structure.suites[0]?.sections[0]?.id;
    if (!sectionId) throw new Error('Expected seeded project structure');
    const title = `MCP payment regression ${randomUUID().slice(0, 8)}`;
    const body = {
      sectionId,
      title,
      template: 'steps',
      content: {
        steps: [{ action: 'Pay using a declined card', expected: 'The order remains unpaid' }],
      },
    };
    const args = { projectSlug, idempotencyKey: randomUUID(), request: body };
    const created = createTestCaseResponseSchema.parse(await call('create_test_case', args));
    expect(await call('create_test_case', args)).toEqual(created);
    const cases = testCaseListResponseSchema.parse(
      await call('list_test_cases', { projectSlug, search: title }),
    );
    expect(cases.items.map((item) => item.id)).toEqual([created.testCase.id]);
    const caseDetail = testCaseDetailResponseSchema.parse(
      await call('get_test_case', { projectSlug, caseId: created.testCase.id }),
    );
    const revisedTitle = `${title} revised`;
    const updateArgs = {
      projectSlug,
      caseId: created.testCase.id,
      idempotencyKey: randomUUID(),
      request: {
        ...body,
        title: revisedTitle,
        baseVersion: caseDetail.testCase.currentVersion.version,
      },
    };
    const updated = updateTestCaseResponseSchema.parse(await call('update_test_case', updateArgs));
    expect(updated.version.version).toBe(2);
    expect(await call('update_test_case', updateArgs)).toEqual(updated);
    await page.goto('/acme');
    await expect(page).toHaveURL(/\/acme\/projects$/);
    await page.goto(`/acme/${projectSlug}/cases/${created.testCase.id}`);
    await expect(page.getByRole('heading', { name: revisedTitle, exact: true })).toBeVisible();

    const gate = {
      key: 'no-failures',
      metricKey: 'test.failed_count',
      metricVersion: '1.0.0',
      dimensions: { testRunRole: 'required' },
      operator: 'eq',
      expected: { type: 'integer', value: 0 },
      impact: 'blocking',
    };
    const name = `MCP quality ${randomUUID().slice(0, 8)}`;
    const policy = readinessPolicyResponseSchema.parse(
      await call('create_release_policy', {
        projectSlug,
        idempotencyKey: randomUUID(),
        request: { key: `mcp-${randomUUID()}`, name, gates: [gate] },
      }),
    );
    expect(policy.policy.versions[0]?.state).toBe('draft');
    const policyArgs = { projectSlug, policyId: policy.policy.id };
    const listed = readinessPolicyListResponseSchema.parse(
      await call('list_release_policies', { projectSlug }),
    );
    expect(listed.items.some((item) => item.id === policy.policy.id)).toBe(true);
    expect(await call('get_release_policy', policyArgs)).toEqual(policy);
    const published = readinessPolicyResponseSchema.parse(
      await call('publish_release_policy', { ...policyArgs, idempotencyKey: randomUUID() }),
    );
    expect(published.policy.versions[0]?.state).toBe('published');
    const versioned = readinessPolicyResponseSchema.parse(
      await call('create_policy_version', {
        ...policyArgs,
        idempotencyKey: randomUUID(),
        request: { gates: [{ ...gate, impact: 'warning' }] },
      }),
    );
    expect(versioned.policy.versions).toHaveLength(2);
    await page.goto(`/acme/${projectSlug}/release-policies/${policy.policy.id}`);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.locator('main')).toContainText('Draft');
    await expect(page.locator('main')).toContainText('Published');

    const releaseResponse = await request.post(`/api/v1/projects/${projectSlug}/releases`, {
      headers: { ...workspaceHeaders, 'idempotency-key': randomUUID() },
      data: { key: 'MCP-1', name: 'MCP release' },
    });
    expect(releaseResponse.ok()).toBeTruthy();
    const release = createReleaseResponseSchema.parse(await releaseResponse.json()).release;
    const candidateResponse = await request.post(
      `/api/v1/projects/${projectSlug}/releases/${release.id}/candidates`,
      {
        headers: { ...workspaceHeaders, 'idempotency-key': randomUUID() },
        data: { buildIdentifier: `mcp-${suffix}` },
      },
    );
    expect(candidateResponse.ok()).toBeTruthy();
    const candidate = createReleaseCandidateResponseSchema.parse(
      await candidateResponse.json(),
    ).candidate;
    const assignment = await request.put(
      `/api/v1/projects/${projectSlug}/candidates/${candidate.id}/readiness-policy`,
      {
        headers: { ...workspaceHeaders, 'idempotency-key': randomUUID() },
        data: { policyId: policy.policy.id },
      },
    );
    expect(assignment.ok()).toBeTruthy();
    const evaluated = await request.post(
      `/api/v1/projects/${projectSlug}/candidates/${candidate.id}/readiness/evaluations`,
      { headers: workspaceHeaders },
    );
    expect(evaluated.ok()).toBeTruthy();
    const readiness = await call('get_candidate_readiness', {
      projectSlug,
      candidateId: candidate.id,
    });
    const validated = candidateReadinessResponseSchema.parse(readiness);
    expect(validated.decision?.status).toBe('unknown');
    const authoritative = await request.get(
      `/api/v1/projects/${projectSlug}/candidates/${candidate.id}/readiness`,
      { headers: workspaceHeaders },
    );
    expect(authoritative.ok()).toBeTruthy();
    expect(readiness).toEqual(await authoritative.json());
    await request.delete(`/api/v1/api-tokens/${credential.apiToken.id}`, {
      headers: workspaceHeaders,
    });
    const denied = await client.callTool({ name: 'list_projects', arguments: {} });
    expect(denied.isError).toBe(true);
    const errorContent = CallToolResultSchema.parse(denied).content.find(
      (item) => item.type === 'text',
    );
    if (errorContent?.type !== 'text') throw new Error('Expected a JSON authentication error');
    expect(JSON.parse(errorContent.text)).toMatchObject({ error: { status: 401 } });
    expect(diagnostics).not.toContain(credential.token);
    expect(errors).toEqual([]);
  } finally {
    await client.close();
    await transport.close();
    await request.delete(`/api/v1/api-tokens/${credential.apiToken.id}`, {
      headers: workspaceHeaders,
    });
  }
});
