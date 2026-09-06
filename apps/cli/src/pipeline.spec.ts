import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCommand } from './arguments.js';
import { runCli } from './cli.js';
import { runPipeline } from './pipeline.js';

const candidateId = '11111111-1111-4111-8111-111111111111';
const decisionId = '22222222-2222-4222-8222-222222222222';
const releaseId = '33333333-3333-4333-8333-333333333333';
const token = 'clg_test-only-pipeline';

describe('pipeline CLI', () => {
  let server: Server;
  let apiUrl: string;
  const requests: Array<{ path: string; method: string; key: string; body: string }> = [];
  let respond: (index: number) => { status: number; body: unknown };
  beforeEach(async () => {
    requests.length = 0;
    respond = () => ({ status: 200, body: readiness('ready') });
    server = createServer(async (request, response) => {
      expect(request.headers.authorization).toBe(`Bearer ${token}`);
      let body = '';
      for await (const chunk of request) body += chunk.toString();
      requests.push({
        path: request.url ?? '',
        method: request.method ?? '',
        key: String(request.headers['idempotency-key']),
        body,
      });
      const result = respond(requests.length - 1);
      response.writeHead(result.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result.body));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected an HTTP test server');
    apiUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function command(argv: string[]) {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runCli(
      argv,
      { CASELOG_TOKEN: token, CASELOG_API_URL: apiUrl },
      { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) },
    );
    return { code, stdout, stderr, output: stdout[0] ? JSON.parse(stdout[0]) : null };
  }
  const checkArgs = () => [
    'readiness',
    'check',
    '--project',
    'checkout',
    '--candidate',
    candidateId,
    '--json',
  ];

  it.each([
    ['ready', 0],
    ['at_risk', 0],
    ['blocked', 1],
    ['unknown', 2],
    ['approved_with_waiver', 0],
  ] as const)('maps server disposition %s to exit %s', async (disposition, exitCode) => {
    respond = () => ({ status: 200, body: readiness(disposition) });
    const result = await command(checkArgs());
    expect(result.code).toBe(exitCode);
    expect(result.output).toMatchObject({
      version: 1,
      command: 'readiness check',
      exitCode,
      data: { candidateId },
    });
    expect(result.stderr).toEqual([]);
  });

  it('waits through pending and stale states without accepting an old ready decision', async () => {
    respond = (index) => ({
      status: 200,
      body: {
        ...readiness('ready'),
        state: index === 0 ? 'pending' : index === 1 ? 'stale' : 'current',
      },
    });
    const result = await command([...checkArgs(), '--wait', '--poll-interval', '0.1']);
    expect(result.code).toBe(0);
    expect(requests).toHaveLength(3);
  });

  it('waits for required evidence to arrive without accepting missing or stale inputs', async () => {
    respond = (index) => {
      const value = readiness(index < 3 ? 'blocked' : 'ready');
      return {
        status: 200,
        body: {
          ...value,
          decision: {
            ...value.decision,
            gates:
              index < 3
                ? [
                    {
                      result: 'failed',
                      diagnostic: ['missing', 'incomplete', 'stale'][index],
                    },
                  ]
                : [],
          },
        },
      };
    };
    expect((await command([...checkArgs(), '--wait', '--poll-interval', '0.1'])).code).toBe(0);
    expect(requests).toHaveLength(4);
  });

  it('re-evaluates fresh inputs while waiting for native materialization', async () => {
    respond = (index) => ({
      status: 201,
      body: {
        ...readiness(index === 0 ? 'blocked' : 'ready'),
        decision: {
          ...readiness(index === 0 ? 'blocked' : 'ready').decision,
          gates: index === 0 ? [{ result: 'failed', diagnostic: 'missing' }] : [],
        },
      },
    });
    const args = [...checkArgs()];
    args[1] = 'evaluate';
    expect((await command([...args, '--wait', '--poll-interval', '0.1'])).code).toBe(0);
    expect(requests.map(({ method }) => method)).toEqual(['POST', 'POST']);
    expect(requests[0]?.path).toContain('/readiness/evaluations');
  });

  it('returns error exit 2 for a terminal failure or mismatched candidate', async () => {
    respond = () => ({ status: 200, body: { ...readiness('ready'), state: 'failed' } });
    expect((await command([...checkArgs(), '--wait'])).code).toBe(2);
    respond = () => ({ status: 200, body: { ...readiness('ready'), candidateId: releaseId } });
    const invalid = await command(checkArgs());
    expect(invalid.code).toBe(2);
    expect(invalid.output.error.code).toBe('invalid_response');
  });

  it('retries transient candidate creation with one stable idempotency key', async () => {
    respond = (index) =>
      index === 0
        ? { status: 503, body: {} }
        : { status: 201, body: { candidate: { id: candidateId } } };
    const argv = [
      'candidate',
      'create',
      '--project',
      'checkout',
      '--release',
      releaseId,
      '--commit',
      'abc123',
      '--build',
      'build-17',
      '--json',
    ];
    const first = await command(argv);
    expect(first.code).toBe(0);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.key).toBe(requests[1]?.key);
    expect(JSON.parse(requests[1]?.body ?? '')).toEqual({
      sourceRevision: 'abc123',
      buildIdentifier: 'build-17',
    });
    expect((await command(argv)).code).toBe(0);
    expect(requests[2]?.key).toBe(requests[0]?.key);
  });

  it('does not retry authorization errors or echo sensitive server messages', async () => {
    respond = () => ({
      status: 403,
      body: { error: { code: 'insufficient_permissions', message: token } },
    });
    const result = await command(checkArgs());
    expect(result.code).toBe(2);
    expect(result.output.error.code).toBe('insufficient_permissions');
    expect(JSON.stringify(result)).not.toContain(token);
    expect(requests).toHaveLength(1);
  });

  it('cancels a wait with bounded execution and removes process handlers', async () => {
    respond = () => ({ status: 200, body: { ...readiness('ready'), state: 'pending' } });
    const parsed = parseCommand([...checkArgs(), '--wait'], {
      CASELOG_TOKEN: token,
      CASELOG_API_URL: apiUrl,
    });
    if (parsed.kind !== 'pipeline') throw new Error('Expected pipeline command');
    const before = process.listenerCount('SIGINT');
    await expect(runPipeline({ ...parsed, timeoutMs: 25, pollMs: 5 })).rejects.toMatchObject({
      code: 'cancelled_or_timed_out',
    });
    expect(process.listenerCount('SIGINT')).toBe(before);
    await expect(runPipeline(parsed, AbortSignal.abort())).rejects.toMatchObject({
      code: 'cancelled_or_timed_out',
    });
  });

  it('uses versioned error JSON for invalid arguments', async () => {
    const result = await command(['readiness', 'check', '--candidate', 'bad', '--json']);
    expect(result.code).toBe(2);
    expect(result.output).toMatchObject({
      version: 1,
      exitCode: 2,
      error: { code: 'invalid_arguments' },
    });
    expect(requests).toEqual([]);
  });
});

function readiness(disposition: string) {
  return {
    candidateId,
    state: 'current',
    currentEvidenceRevision: 3,
    targetEvidenceRevision: 3,
    decision: {
      id: decisionId,
      candidateId,
      evidenceRevision: 3,
      status: disposition === 'approved_with_waiver' ? 'blocked' : disposition,
      effectiveDisposition: disposition,
      gates: [],
    },
  };
}
