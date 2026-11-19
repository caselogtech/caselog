# MCP suite and section creation

Status: Accepted. Date: 2026-11-19.

## Context

The user approved extending the initial MCP adapter with suite and section creation.
An agent must be able to prepare structure in an existing project and then author cases
without manual setup. The public REST API already owns these operations for the UI.
This decision extends the operation scope of the initial MCP adapter decision.

## Decision

Add `create_suite` and `create_section` over the existing REST endpoints, using shared
request/response schemas. Sections may be roots or children of a section in the same
suite and project. Existing naming, ordering and parent rules remain authoritative.

Add the independent workspace token scope `structure:write` for these two creates only.
It grants neither structure reads nor case writes, rename, move, delete, project
creation, policy or readiness operations. Current membership must still allow writes.
Existing tokens gain no permissions. Expose the scope as an unchecked option in token
settings. The same artifacts work self-hosted and in managed installations.

Require `Idempotency-Key` for API-token structure creates; retain optional headers for
browser compatibility. Reuse the existing tenant idempotency table and seven-day TTL.
Suite key scope is workspace, project, creator and suite-create operation; section key
scope additionally includes the target suite. Hash the validated request, normalizing
omitted/null root parent IDs. Same key and payload replays the original response;
changed payload conflicts. Failed validation, missing resources and naming conflicts
do not consume the key. Replay returns the original snapshot even if the created record
was renamed, moved or deleted; clients must read structure for current state.

Serialize creates with the existing project lock shared by structure moves/deletions.
Validate suite and parent ownership after acquiring it. Mutation, one append-only audit
record, and keyed response commit in a single tenant transaction. Audit records identify
the user and API token without including secrets or user-authored names. Authorization
precedes replay, so revoked tokens and downgraded memberships cannot use cached writes.

Only these two operations extend the initial scope. Bulk operations, destructive tools,
policy assignment, evaluation, waivers, promotion and remote transport remain separate
decisions.

## Compatibility and recovery

Apply additive migration `20261119190000_mcp_structure_scope` before new binaries. No
data backfill is needed. Before rolling back, revoke tokens carrying `structure:write`
using the newer application, then retain the unused enum label. Existing browser
creation contracts and all twelve earlier MCP tools remain compatible. Regenerate
OpenAPI and Angular types together. MCP discovery now advertises fourteen tools.

## Verification

Prove concurrent replay, changed-intent and name conflicts, nested paths, current roles,
separate scopes, tenant/project/suite ownership, invalid input, failed-key reuse,
snapshot replay after changes/deletion and browser compatibility against PostgreSQL.
Exercise typed MCP results and complete stdio structure → case → UI authoring; verify
the additive migration on an existing database and an empty browser database.
