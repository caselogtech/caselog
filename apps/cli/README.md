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

## Release readiness in CI

Create a workspace API token from Settings → API tokens. Candidate creation and run
linking require `candidates:write`; policy assignment and evaluation require
`readiness:write`; reading decisions requires `readiness:read`. Closing a completed CI test run requires
both `candidates:write` and `results:write`. Keep `results:write`
for JUnit uploads and `evidence:write` for external observations. Tokens retain the
creator's current workspace role: writes require lead or higher. These scopes do
not permit policy authoring, waivers, destructive unlinking, or token administration.

Provision the release, published policy, test cases, and test run through the UI or
public API first. Supply their IDs as CI variables. The following POSIX shell flow
requires `jq` and the locally built CLI:

```bash
export CASELOG_API_URL=https://caselog.example.com/api/v1
# Inject CASELOG_TOKEN from the CI secret store; never echo it.
CANDIDATE_ID=$(node apps/cli/dist/cli.js candidate create \
  --project "$PROJECT_SLUG" --release "$RELEASE_ID" \
  --commit "$COMMIT_SHA" --build "$BUILD_ID" --json | jq -er '.data.id')
node apps/cli/dist/cli.js readiness assign --project "$PROJECT_SLUG" \
  --candidate "$CANDIDATE_ID" --policy "$POLICY_ID"
node apps/cli/dist/cli.js upload --project "$PROJECT_SLUG" --run "$RUN_ID" \
  --candidate "$CANDIDATE_ID" --fail-on-unmatched ./test-results
node apps/cli/dist/cli.js run close --project "$PROJECT_SLUG" --run "$RUN_ID"
node apps/cli/dist/cli.js readiness evaluate --project "$PROJECT_SLUG" \
  --candidate "$CANDIDATE_ID" --wait --timeout 120 --json
```

Link an existing run with `candidate link --project <slug> --candidate <uuid>
--run <uuid> [--role required|informational]`. Upload an external observation with
`evidence upload --project <slug> --candidate <uuid> --file observation.json`;
the JSON follows the public evidence-ingestion schema. The candidate field may be
omitted in the file; a conflicting candidate is rejected. Evidence files are
bounded to 1 MiB and remain subject to server validation and trust rules.

`readiness check --project <slug> --candidate <uuid>` reads the server decision.
Add `--wait` to poll pending, stale, or unknown results, and decisions whose
unsatisfied gates only report missing, incomplete, or stale evidence, with `--timeout` (default
120 seconds, maximum 3600) and `--poll-interval` (default 2 seconds). Failed
background evaluation returns immediately. `evaluate --wait` re-evaluates the
current inputs while waiting; `check --wait` reads the background projection. SIGINT and SIGTERM cancel waiting.
The CLI never recalculates gate outcomes or accepts a stale ready decision.

### Version 1 pipeline output contract

The `candidate`, `run`, `readiness`, and `evidence` commands emit one JSON object with
`--json`: `{ "version": 1, "command": "readiness check", "exitCode": 0, "data": ... }`.
`data` is the public API resource; readiness includes gate diagnostics and the
immutable decision ID. Errors use `error: { code, message }` instead of `data`.

| Exit | Pipeline meaning |
| --- | --- |
| 0 | Write succeeded, or current readiness is ready, at risk (warnings only), or approved with waiver |
| 1 | Current readiness blocks promotion |
| 2 | Unknown/stale/pending/failed readiness, timeout, cancellation, invalid configuration, authentication, or request failure |

The older `upload` command preserves its existing JSON and exit codes described
above. A pipeline should require success from every step, including ingestion.
Transient transport failures and HTTP 429/502/503/504 are retried at most twice
within the deadline. Creation, assignment and ingestion use stable content-derived
idempotency keys; `--idempotency-key` overrides the default. Link operations and
same-input evaluations are idempotent on the server. Redirects are rejected and
HTTP error bodies are not echoed, to avoid exposing credentials or sensitive data.

Readiness is evidence-based: after JUnit ingestion, native evidence is materialized
asynchronously. Close the run after all results are uploaded: an active run is
incomplete evidence even when every recorded test passed. `--wait` waits for the server's current projection; it does not
certify that unrelated producers have finished. Use a distinct immutable candidate
per build and require all expected evidence in its policy before promotion.
