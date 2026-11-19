import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

const entry = fileURLToPath(new URL('../../dist/main.js', import.meta.url));
const token = `clg_testtest_${'t'.repeat(43)}`;

describe('MCP stdio entrypoint', () => {
  it('exits with a safe stderr diagnostic and empty stdout for invalid configuration', async () => {
    const child = spawn(process.execPath, [entry], {
      env: {
        CASELOG_API_URL: `https://secret:${token}@caselog.example/api/v1`,
        CASELOG_TOKEN: token,
      },
      stdio: 'pipe',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const [code] = await once(child, 'close');
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('Check CASELOG_API_URL and CASELOG_TOKEN');
    expect(stderr).not.toContain(token);
    expect(stderr).not.toContain('https://secret');
  });

  it('initializes and discovers tools over a real stdio subprocess without stdout contamination', async () => {
    const client = new Client({ name: 'stdio-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      stderr: 'pipe',
      env: { CASELOG_API_URL: 'https://caselog.example/api/v1', CASELOG_TOKEN: token },
    });
    let stderr = '';
    transport.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    try {
      await client.connect(transport);
      expect(client.getServerVersion()?.name).toBe('caselog');
      expect((await client.listTools()).tools).toHaveLength(14);
      expect(stderr).toBe('');
    } finally {
      await client.close();
      await transport.close();
    }
  });

  it('terminates cleanly when stdin closes', async () => {
    const child = spawn(process.execPath, [entry], {
      env: { CASELOG_API_URL: 'https://caselog.example/api/v1', CASELOG_TOKEN: token },
      stdio: 'pipe',
    });
    child.stdin.end();
    const [code] = await once(child, 'close');
    expect(code).toBe(0);
  });
});
