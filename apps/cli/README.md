# Caselog CLI

The Caselog CLI uploads automated test results from CI without a browser session.

## Build and run locally

```bash
pnpm --filter @caselog/cli build
CASELOG_TOKEN=clg_... node apps/cli/dist/cli.js upload \
  --project checkout \
  --run 11111111-1111-4111-8111-111111111111 \
  ./test-results
```

`CASELOG_TOKEN` must be an organization-scoped API token with `results:write`.
`CASELOG_API_URL` defaults to `http://localhost:3000/api/v1` and can also be set
with `--api-url`.

The input can be one JUnit XML file or a directory. Directories are searched
recursively for `.xml` files. Every file is streamed independently and receives a
content-based idempotency key, so rerunning the same command does not duplicate
results.

Use `--json` for machine-readable output and `--fail-on-unmatched` to return exit
code `2` when Caselog cannot match one or more results. Invalid configuration,
network failures and API errors return exit code `1`.

The token is intentionally accepted only through `CASELOG_TOKEN`; command-line
arguments can be exposed in shell history and process listings.
