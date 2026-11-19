# Caselog MCP

Optional stdio MCP adapter for the Caselog public API. Requires Node from `.nvmrc`,
a running Caselog installation, and an expiring workspace API token.

```bash
pnpm --filter @caselog/mcp build
```

Launch `node /absolute/path/to/apps/mcp/dist/main.js` from your MCP client with
`CASELOG_API_URL=https://your-installation/api/v1` and `CASELOG_TOKEN` supplied securely
through its environment. Loopback HTTP is supported for local development. Launch
Node directly: package-manager output must not enter protocol stdout.

See the [connection and scenario guide](../docs/src/content/docs/automation/mcp.md)
for tools, scopes, retries, client configuration and limits. This adapter uses the same
public API for self-hosted and managed deployments. It has no model-provider dependency.

Verify with `pnpm --filter @caselog/mcp test`. API authoring boundaries are covered by
the API workspace's real-PostgreSQL suites, and the browser suite exercises real stdio.
