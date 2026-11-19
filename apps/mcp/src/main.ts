#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readConfiguration } from './domain/configuration.js';
import { createMcpServer } from './server.js';

try {
  const server = createMcpServer(readConfiguration(process.env));
  const transport = new StdioServerTransport();
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close();
  };
  process.once('SIGINT', () => {
    void close();
  });
  process.once('SIGTERM', () => {
    void close();
  });
  await server.connect(transport);
} catch {
  process.stderr.write(
    'Unable to start Caselog MCP. Check CASELOG_API_URL and CASELOG_TOKEN; see apps/mcp/README.md.\n',
  );
  process.exitCode = 1;
}
