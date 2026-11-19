import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMcpServer } from '../server.js';

const token = `clg_testtest_${'t'.repeat(43)}`;
const caseId = '00000000-0000-4000-8000-000000000101';
const sectionId = '00000000-0000-4000-8000-000000000102';
const policyId = '00000000-0000-4000-8000-000000000103';
const now = '2026-11-19T12:00:00.000Z';
const summary = {
  id: caseId,
  caseNumber: '1',
  title: 'Declined payment',
  template: 'steps',
  automationId: null,
  section: { id: sectionId, name: 'Payments' },
  updatedAt: now,
};

describe('MCP protocol tools', () => {
  let client: Client;
  let server: McpServer;
  const fetcher = vi.fn();
  beforeEach(async () => {
    fetcher.mockReset();
    vi.stubGlobal('fetch', fetcher);
    server = createMcpServer({ apiUrl: 'https://caselog.example/api/v1', token });
    client = new Client({ name: 'test-agent', version: '1.0.0' });
    const [caller, receiver] = InMemoryTransport.createLinkedPair();
    await server.connect(receiver);
    await client.connect(caller);
  });
  afterEach(async () => {
    await client.close();
    await server.close();
    vi.unstubAllGlobals();
  });

  it('discovers exactly fourteen tools and distinguishes reading, authoring and publication', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'list_projects',
      'get_project_structure',
      'create_suite',
      'create_section',
      'list_test_cases',
      'get_test_case',
      'create_test_case',
      'update_test_case',
      'list_release_policies',
      'get_release_policy',
      'create_release_policy',
      'create_policy_version',
      'publish_release_policy',
      'get_candidate_readiness',
    ]);
    expect(tools.find((tool) => tool.name === 'get_test_case')?.annotations?.readOnlyHint).toBe(
      true,
    );
    expect(
      tools.find((tool) => tool.name === 'create_release_policy')?.annotations?.destructiveHint,
    ).toBe(false);
    expect(
      tools.find((tool) => tool.name === 'publish_release_policy')?.annotations?.destructiveHint,
    ).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns validated project pagination without automatically fetching additional pages', async () => {
    fetcher.mockResolvedValue(Response.json({ items: [], nextCursor: caseId }));
    const result = await client.callTool({ name: 'list_projects', arguments: { limit: 1 } });
    expect(result.structuredContent).toEqual({ items: [], nextCursor: caseId });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/projects?limit=1&state=active');
  });

  it.each([
    {
      name: 'create_suite',
      request: { name: 'Payments' },
      response: { id: policyId, name: 'Payments', position: 0 },
      path: '/structure/suites',
      params: {},
    },
    {
      name: 'create_section',
      request: { name: 'Payments' },
      response: {
        id: sectionId,
        suiteId: policyId,
        name: 'Payments',
        parentId: null,
        depth: 0,
        position: 0,
      },
      path: `/structure/suites/${policyId}/sections`,
      params: { suiteId: policyId },
    },
    {
      name: 'create_section',
      request: { name: 'Recovery', parentId: caseId },
      response: {
        id: sectionId,
        suiteId: policyId,
        name: 'Recovery',
        parentId: caseId,
        depth: 1,
        position: 0,
      },
      path: `/structure/suites/${policyId}/sections`,
      params: { suiteId: policyId },
    },
  ])(
    'creates structure through $name with validated output and a write key',
    async ({ name, request, response, path, params }) => {
      await client.listTools();
      fetcher.mockResolvedValue(Response.json(response));
      const result = await client.callTool({
        name,
        arguments: { projectSlug: 'checkout', ...params, idempotencyKey: 'structure-123', request },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(response);
      expect(String(fetcher.mock.calls[0]?.[0])).toBe(
        `https://caselog.example/api/v1/projects/checkout${path}`,
      );
      expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
        method: 'POST',
        body: JSON.stringify(request),
        headers: { 'idempotency-key': 'structure-123' },
      });
    },
  );

  it('validates case template and forwards a write key with a typed creation result', async () => {
    const body = {
      title: 'Declined payment',
      sectionId,
      template: 'steps',
      content: { steps: [{ action: 'Pay', expected: 'Declined' }] },
    };
    fetcher.mockResolvedValue(
      Response.json({ testCase: summary, version: { id: policyId, version: 1 } }),
    );
    const result = await client.callTool({
      name: 'create_test_case',
      arguments: { projectSlug: 'checkout', idempotencyKey: 'intent-123', request: body },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      testCase: { id: caseId },
      version: { version: 1 },
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'idempotency-key': 'intent-123' },
    });
  });

  it.each([
    { name: 'create_suite', arguments: { projectSlug: 'checkout', request: { name: 'Payments' } } },
    {
      name: 'create_suite',
      arguments: { projectSlug: 'checkout', idempotencyKey: 'intent-123', request: { name: ' ' } },
    },
    {
      name: 'create_suite',
      arguments: {
        projectSlug: 'checkout',
        idempotencyKey: 'intent-123',
        request: { name: 'x'.repeat(121) },
      },
    },
    {
      name: 'create_suite',
      arguments: {
        projectSlug: 'checkout',
        idempotencyKey: 'intent-123',
        request: { name: 'Payments', organizationId: caseId },
      },
    },
    {
      name: 'create_section',
      arguments: {
        projectSlug: 'checkout',
        suiteId: '../other',
        idempotencyKey: 'intent-123',
        request: { name: 'Payments' },
      },
    },
    {
      name: 'create_section',
      arguments: {
        projectSlug: 'checkout',
        suiteId: policyId,
        idempotencyKey: 'intent-123',
        request: { name: 'Payments', parentId: 'invalid' },
      },
    },
    {
      name: 'create_section',
      arguments: {
        projectSlug: 'checkout',
        suiteId: policyId,
        idempotencyKey: 'short',
        request: { name: 'Payments' },
      },
    },
    { name: 'list_projects', arguments: { organizationId: caseId } },
    { name: 'get_test_case', arguments: { projectSlug: '../other', caseId } },
    { name: 'list_test_cases', arguments: { projectSlug: 'checkout', limit: 101 } },
    {
      name: 'create_test_case',
      arguments: {
        projectSlug: 'checkout',
        request: {
          title: 'Case',
          sectionId,
          template: 'text',
          content: { steps: [{ action: 'Wrong template' }] },
        },
      },
    },
    {
      name: 'create_release_policy',
      arguments: {
        projectSlug: 'checkout',
        idempotencyKey: 'intent-123',
        request: { key: 'quality', name: 'Quality', gates: [] },
      },
    },
  ])('rejects invalid or tenant-overriding arguments before HTTP', async (request) => {
    const result = await client.callTool(request);
    expect(result.isError).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns API conflicts as tool errors without output-contract failures', async () => {
    await client.listTools();
    fetcher.mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'case_version_conflict',
            message: 'Unsafe raw body',
            details: { currentVersion: 3 },
            requestId: 'req-123',
          },
        },
        { status: 409 },
      ),
    );
    const result = await client.callTool({
      name: 'update_test_case',
      arguments: {
        projectSlug: 'checkout',
        caseId,
        idempotencyKey: 'intent-123',
        request: {
          title: 'Case',
          sectionId,
          template: 'text',
          content: { text: 'Read current content' },
          baseVersion: 1,
        },
      },
    });
    expect(result.isError).toBe(true);
    const content = CallToolResultSchema.parse(result).content.find((item) => item.type === 'text');
    if (content?.type !== 'text') throw new Error('Expected a JSON error message');
    expect(JSON.parse(content.text)).toMatchObject({
      error: { code: 'case_version_conflict', currentVersion: 3, requestId: 'req-123' },
    });
    expect(JSON.stringify(result)).not.toContain('Unsafe raw body');
  });

  it('publishes only through the separate publication endpoint', async () => {
    const policy = {
      id: policyId,
      projectId: sectionId,
      key: 'quality',
      name: 'Quality',
      description: null,
      createdAt: now,
      updatedAt: now,
      versions: [],
    };
    fetcher.mockResolvedValue(Response.json({ policy }));
    const result = await client.callTool({
      name: 'publish_release_policy',
      arguments: { projectSlug: 'checkout', policyId, idempotencyKey: 'publish-123' },
    });
    expect(result.isError).not.toBe(true);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      `https://caselog.example/api/v1/projects/checkout/release-policies/${policyId}/publish`,
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'idempotency-key': 'publish-123' },
    });
  });
});
