# MCP access through the public API

Status: Accepted. Date: 2026-11-19.

## Context

Agents need to discover projects, author test cases and release policies, and read
candidate readiness. The user approved this explicit extension to the otherwise closed
feature set. Existing application modules remain the systems of record.

## Decision

Ship an AGPL-3.0-only `apps/mcp` Node.js adapter using the official TypeScript MCP SDK
and stdio. It calls the public REST API using shared Zod contracts and an expiring,
workspace-scoped API token supplied through the environment. It has no database,
backend-module imports, browser credentials, LLM dependency, or hosted control plane.
The same adapter works with self-hosted and managed installations.

Expose the twelve named operations documented in the public MCP guide. Publishing a
policy is separate from authoring it. Token scopes are independent: writing does not
implicitly grant reading or publishing. API roles and tenant isolation still apply.
Project discovery, case authoring and policy authoring receive additive scopes. Existing
tokens keep their original permissions; no existing scope gains authoring privileges.

Case creation and update accept an optional `Idempotency-Key` for compatibility with
existing browser clients. These two operations require the key for API tokens. Scope
case keys by workspace, project, creator and operation (including case ID for updates).
Replay the original response for the same validated payload for seven days; a different
payload conflicts. Update replay precedes optimistic-version validation; a new key
with a stale base version conflicts. Failed validation does not consume the key.
Use the existing tenant idempotency table in the same transaction as the mutation.
Policies preserve their existing idempotency and append-only version contracts.

The adapter accepts only a configured API base URL and constructs endpoint paths from
validated slugs/UUIDs. Require HTTPS except loopback HTTP. Refuse URL credentials,
query strings, fragments and redirects. Bound requests, responses and execution time;
do not automatically retry writes or follow instructions embedded in returned content.
Return validated structured results and safe machine-readable errors. stdout contains
only MCP messages. Secrets and raw server failures are never returned to the model.

## Compatibility and recovery

The database migration only adds enum labels. Apply it before new application artifacts;
there is no data backfill. Revoke tokens with new scopes before rolling back to binaries
that do not understand them. Keep unused enum labels during rollback. Browser case
writes without a key remain supported. REST/OpenAPI and generated web types are updated
together. MCP tool names and schemas are a public versioned contract.

Remote HTTP transport/OAuth, suite/section mutations, bulk operations, destructive case
operations, waivers, approvals and release promotion are outside this first version.
Adding them requires separately accepted scope and corresponding API safeguards.

The subsequently accepted [structure authoring extension](20261119-mcp-structure-authoring.md)
adds suite and section creation with an independent scope and replay contract. Other
operations listed above remain outside the approved scope.

## Verification

Prove SDK discovery and tool calls over stdio, real API persistence, policy lifecycle,
tenant isolation, role/scope denial, revocation, expiry, optimistic concurrency,
concurrent idempotent writes, safe transport failures, and browser visibility. Run
repository checks, tests and builds; mark roadmap acceptance only when verified.
