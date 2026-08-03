import { createServer, type IncomingMessage } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { UploadCommand } from './arguments.js';
import { runCli } from './cli.js';
import { resolveJUnitFiles, uploadJUnit } from './upload.js';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('JUnit upload', () => {
  it('discovers XML recursively and uploads each file as a stream with stable retry keys', async () => {
    const directory = await temporaryDirectory();
    await mkdir(join(directory, 'nested'));
    await writeFile(join(directory, 'b.xml'), '<testsuite><testcase name="b" /></testsuite>');
    await writeFile(
      join(directory, 'nested', 'a.XML'),
      '<testsuite><testcase name="a" /></testsuite>',
    );
    await writeFile(join(directory, 'ignored.txt'), 'not junit');

    const requests: CapturedRequest[] = [];
    const server = createServer(async (request, response) => {
      requests.push(await captureRequest(request));
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify(successResponse()));
    });
    const apiUrl = await listen(server);

    try {
      const command = uploadCommand(directory, apiUrl);
      const first = await uploadJUnit(command);
      const second = await uploadJUnit(command);

      expect(first).toMatchObject({
        total: 2,
        recorded: 2,
        unmatched: 0,
        counts: { passed: 2, failed: 0, error: 0, skipped: 0 },
      });
      expect(second).toEqual(first);
      expect(requests).toHaveLength(4);
      expect(requests.map(({ authorization }) => authorization)).toEqual([
        'Bearer clg_test-token',
        'Bearer clg_test-token',
        'Bearer clg_test-token',
        'Bearer clg_test-token',
      ]);
      expect(requests[0]?.idempotencyKey).toBe(requests[2]?.idempotencyKey);
      expect(requests[1]?.idempotencyKey).toBe(requests[3]?.idempotencyKey);
      expect(requests[0]?.idempotencyKey).not.toBe(requests[1]?.idempotencyKey);
      expect(requests.every(({ path }) => path.endsWith(`/runs/${RUN_ID}/results/junit`))).toBe(
        true,
      );
      expect(requests.map(({ body }) => body).sort()).toEqual([
        '<testsuite><testcase name="a" /></testsuite>',
        '<testsuite><testcase name="a" /></testsuite>',
        '<testsuite><testcase name="b" /></testsuite>',
        '<testsuite><testcase name="b" /></testsuite>',
      ]);
    } finally {
      server.close();
    }
  });

  it('returns exit code 2 for unmatched results when requested', async () => {
    const directory = await temporaryDirectory();
    const file = join(directory, 'results.xml');
    await writeFile(file, '<testsuite><testcase name="missing" /></testsuite>');
    const server = createServer(async (request, response) => {
      await captureRequest(request);
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          ...successResponse(),
          recorded: 0,
          unmatched: [
            {
              sequence: 1,
              name: 'missing',
              automationId: 'missing',
              caseNumber: null,
              reason: 'not_found',
            },
          ],
        }),
      );
    });
    const apiUrl = await listen(server);
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const exitCode = await runCli(
        [
          'upload',
          '--project',
          'checkout',
          '--run',
          RUN_ID,
          '--api-url',
          apiUrl.toString(),
          '--json',
          '--fail-on-unmatched',
          file,
        ],
        { CASELOG_TOKEN: 'clg_test-token' },
        { stdout: (message) => stdout.push(message), stderr: (message) => stderr.push(message) },
      );

      expect(exitCode).toBe(2);
      expect(stderr).toEqual([]);
      expect(JSON.parse(stdout[0] ?? '{}')).toMatchObject({ unmatched: 1, recorded: 0, total: 1 });
    } finally {
      server.close();
    }
  });

  it('rejects missing paths and directories without XML files', async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, 'result.txt'), 'no XML');

    await expect(resolveJUnitFiles(join(directory, 'missing'))).rejects.toThrow(
      'Input path does not exist',
    );
    await expect(resolveJUnitFiles(directory)).rejects.toThrow('No JUnit XML files found');
  });
});

type CapturedRequest = {
  path: string;
  authorization: string | undefined;
  idempotencyKey: string | undefined;
  body: string;
};

async function captureRequest(request: IncomingMessage): Promise<CapturedRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return {
    path: request.url ?? '',
    authorization: request.headers.authorization,
    idempotencyKey: request.headers['idempotency-key'] as string | undefined,
    body: Buffer.concat(chunks).toString('utf8'),
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'caselog-cli-'));
  tempDirectories.push(directory);
  return directory;
}

async function listen(server: ReturnType<typeof createServer>): Promise<URL> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP test server');
  return new URL(`http://127.0.0.1:${address.port}/api/v1/`);
}

function uploadCommand(inputPath: string, apiUrl: URL): UploadCommand {
  return {
    kind: 'upload',
    inputPath,
    projectSlug: 'checkout',
    runId: RUN_ID,
    apiUrl,
    token: 'clg_test-token',
    json: false,
    failOnUnmatched: false,
  };
}

function successResponse() {
  return {
    total: 1,
    recorded: 1,
    truncated: 0,
    counts: { passed: 1, failed: 0, error: 0, skipped: 0 },
    unmatched: [],
  };
}
