---
title: Agents and MCP
description: Connect an agent to Caselog projects, test cases, policies, and readiness.
---

Caselog's MCP adapter lets an agent call the public API using a workspace API token.
The agent supplies the language model; Caselog does not require an LLM subscription
or send prompts to an AI provider. Self-hosted and managed installations use the same
adapter. Workspace content returned by tools is data, never instructions to the agent.

## Supported scenarios

This table defines the approved scope and acceptance behavior. All writes use existing
application rules; creating a policy does not publish or assign it.

| Tool | Scenario | Acceptance behavior |
| --- | --- | --- |
| `list_projects` | Find a project in the token's workspace. | Return a bounded page, project metrics and `nextCursor`; support active/archived filters and an empty list. |
| `get_project_structure` | Inspect suites and sections before creating structure or authoring a case. | Return the project's suites/sections and their IDs; reject missing or foreign projects. |
| `create_suite` | Prepare a test suite in an existing project. | Require `structure:write`, write role and an idempotency key; return the suite ID/order, reject duplicate names, and replay keyed requests without duplication. |
| `create_section` | Prepare a root or nested section before adding cases. | Require the same scope/role/key; optional `parentId` must belong to the target suite and project; preserve server ordering, depth and path, and reject missing or foreign parents. |
| `list_test_cases` | Search existing cases before adding coverage. | Support title search, section, active/archived state and cursor pagination; do not fetch all pages implicitly. |
| `get_test_case` | Read the current case and its version history. | Return content, section, current version and historical version summaries from the API. |
| `create_test_case` | Create a steps, text, exploratory or BDD case in an existing section. | Validate template/content, return ID and version 1, persist the case for API/UI clients, and replay the same keyed request without duplication. |
| `update_test_case` | Revise an existing case using the version the agent read. | Require `baseVersion`; append a new version, preserve history, reject concurrent edits, and replay a successful keyed update even after its base becomes stale. |
| `list_release_policies` | Find existing release rules before authoring. | Return draft/published summaries and cursor pagination, including an empty list. |
| `get_release_policy` | Inspect a policy's exact versions and gates. | Return server-owned versions and states without recomputing outcomes in the adapter. |
| `create_release_policy` | Translate agreed release criteria into an initial draft. | Validate supported metrics, operators, thresholds, trust and freshness rules; require unique gate keys and an idempotency key. |
| `create_policy_version` | Prepare changed gates for an existing policy. | Create the next draft without rewriting published versions; report an existing-draft conflict. |
| `publish_release_policy` | Publish an explicitly requested draft. | Require the separate `policies:publish` scope and lead-or-higher role; keep publication separate from drafting, assignment and release promotion. |
| `get_candidate_readiness` | Explain what blocks an exact immutable candidate. | Return the server response, including pending, failed, stale, unknown and waived states when present; never turn missing evidence into a passing decision. |

## Access model

Create an expiring token under **Workspace settings → API tokens** as an owner/admin.
Select only the required scopes. Active tokens inherit the creator's current membership
and role. Reading and writing scopes are independent; a writer usually needs both.

| Scope | MCP operations | Minimum workspace role |
| --- | --- | --- |
| `projects:read` | `list_projects`, `get_project_structure` | Read only |
| `structure:write` | `create_suite`, `create_section` | Tester/contributor |
| `cases:read` | `list_test_cases`, `get_test_case` | Read only |
| `cases:write` | `create_test_case`, `update_test_case` | Tester/contributor |
| `policies:read` | `list_release_policies`, `get_release_policy` | Read only |
| `policies:write` | `create_release_policy`, `create_policy_version` | Lead |
| `policies:publish` | `publish_release_policy` | Lead |
| `readiness:read` | `get_candidate_readiness` | Read only |

The token selects exactly one workspace. Tool arguments cannot supply a tenant ID,
alternate credentials, arbitrary URL or arbitrary HTTP method. Use a different token
and MCP configuration for another workspace. Existing CI scopes do not acquire case
or policy authoring permissions. Tokens cannot administer other tokens or members.

## Failure and boundary scenarios

| Scenario | Required behavior |
| --- | --- |
| Missing/malformed configuration | Exit with a concise stderr message and nonzero status; never print token values. |
| Insecure remote API URL or URL credentials | Reject configuration. HTTPS is required except HTTP on loopback hosts. |
| MCP initialization and discovery | Complete the SDK handshake; list only the fourteen documented tools with parameter schemas and behavior annotations. |
| Malformed/unknown tool arguments | Reject before HTTP; bound strings, arrays, page sizes and payload size. |
| Missing, invalid, expired or revoked token | Report authentication failure; revocation takes effect on subsequent calls. |
| Missing scope or insufficient current role | API denies the call even if an MCP client ignores tool annotations. |
| Foreign project, case, section, policy or candidate | Return not found; never disclose another workspace's data. |
| Empty collection or final page | Return a valid empty list or `nextCursor: null`; do not substitute an error. |
| Same write key and validated payload | Replay the original response for seven days, including concurrent duplicate delivery; create one suite/section/case/version and audit event. |
| Same write key, changed payload | Return a stable idempotency conflict; do not change data. |
| Failed validation or missing section | Do not consume the key; a corrected valid request can use it. |
| New update key with stale `baseVersion` | Return the API version conflict; do not overwrite another user's changes. |
| Missing case/structure-write key | Reject API-token writes; existing browser writes without the header remain compatible. |
| Duplicate structure name | Return `suite_name_taken` or `section_name_taken`; never silently select an existing record. Section names are checked among siblings. |
| Parent in another suite/project/workspace | Return not found, even when a section ID exists elsewhere. |
| Replayed structure create after rename/move/delete | Return the original response snapshot without recreating or reverting records; read structure for current state. |
| Policy draft/key/publication conflict | Return the API conflict without modifying published history or silently selecting another policy. |
| Policy publication without publish scope | Deny even when the token can author drafts. |
| Network failure, deadline or cancellation | Return a safe error; do not automatically retry a write whose outcome is uncertain. |
| API redirect | Refuse it; do not forward credentials to another destination. |
| Oversized, malformed or contract-invalid API response | Stop processing and return a safe upstream-response error. |
| Unexpected API failure | Preserve safe status/code/request ID; do not expose raw bodies, stack traces or credentials. |
| Audit | Record creator identity and API-token attribution for structure/case/policy mutations; never include the token secret. |
| stdio lifecycle | stdout contains only protocol messages; cleanly handle client disconnect and termination. |
| Self-hosted operation | Run without billing, a Caselog account on another installation, or a proprietary control plane. |

## Retry contract

Supply `idempotencyKey` (8–200 letters, digits, dots, underscores, colons or hyphens)
for every write tool. Generate a new key for a new intent and retain it when retrying
an uncertain response. MCP request IDs are not idempotency keys. Case keys are scoped
by workspace, project, creator and operation, including case ID for updates. Policy
keys retain the API's project/policy operation scope. Keep retries within seven days.
After expiry, inspect current state before deciding whether to submit a new write.

Structure keys are scoped by workspace, project, creator and operation; section keys
also include the suite ID. Omitted and null `parentId` both mean a root section and
share the same payload identity. Invalid requests, missing resources and duplicate-name
conflicts do not consume the key. Structure creates require keys for API tokens while
existing browser writes without a key remain compatible. `structure:write` does not
grant reads, case writes, project creation, rename, move or delete.

Case update also requires the latest `baseVersion`. On a new-intent version conflict,
read the case again and reconcile the user's changes before sending a new update.

## Connection

Build the adapter from this repository with the pinned Node/pnpm toolchain:

```bash
pnpm --filter @caselog/mcp build
```

Configure your MCP client to launch Node directly with an absolute entrypoint path.
Supply `CASELOG_API_URL` (ending in `/api/v1`) and `CASELOG_TOKEN` through the client's
secret/environment mechanism. Never commit an actual token in client configuration.

```json
{
  "mcpServers": {
    "caselog": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/caselog/apps/mcp/dist/main.js"],
      "env": {
        "CASELOG_API_URL": "http://127.0.0.1:3000/api/v1",
        "CASELOG_TOKEN": "REPLACE_WITH_A_WORKSPACE_API_TOKEN"
      }
    }
  }
}
```

Client configuration syntax and secret substitution vary; the example shows a common
stdio layout. No HTTP MCP endpoint is exposed. The API must already be running.

Each HTTP request has a 30-second deadline, a 1 MiB request-body limit and a 2 MiB
response limit. Large lists must use smaller pages; oversized case bodies are rejected
before HTTP. The adapter never follows redirects or automatically retries writes.

Successful results include validated `structuredContent` and matching JSON text.
Failed calls set `isError: true` and return JSON text containing an `error` with a stable
code and safe status/request ID when available. Errors omit `structuredContent` because
the advertised output schema describes successful results.

Example requests to an agent:

- “Read the checkout structure, create a missing Payments suite with a Recovery section,
  then add declined-card cases there. Return the suite, section and case IDs.”

- “Find existing checkout cases, then add the missing declined-payment scenario to
  the Payments section. Return the created case ID.”
- “Read this case, preserve its current content and add a regression step as a new version.”
- “Create a draft release policy requiring zero failed tests and complete required runs.
  Show me its gates before publishing.”
- “Explain this candidate's readiness using the server's evidence and decision.”

## Verification and limits

Acceptance requires SDK protocol tests, real-PostgreSQL API tests for scopes, roles,
tenant isolation, retries and history, and a real stdio → API → browser journey.
See [the architecture decision](https://github.com/caselogtech/caselog/blob/main/architecture/decisions/20261119-mcp-api-adapter.md)
for compatibility and migration recovery.

The adapter creates suites/sections in existing projects and writes individual cases
and policies. Structure rename/move/delete, project creation, bulk writes, case
archive/delete/restore, attachments, external integrations, policy assignment, evaluation
requests, waivers, approvals and promotion are not exposed as MCP tools. Remote MCP HTTP/OAuth is a separate future decision.
MCP availability does not change cloud pricing or pilot terms.
