# Release metadata editing

Status: Accepted. Date: 2026-11-21.

## Context

The user found that a release created without an environment could not be corrected
and approved adding editing through the UI and public API. Release candidates remain
immutable identities; correcting release context must preserve their evidence and
historical readiness decisions.

## Decision

Add `PUT /api/v1/projects/:projectSlug/releases/:releaseId` for the complete editable
metadata: `name`, nullable `environmentId`, nullable `targetDate`, and nullable
`externalReference`. Require `expectedUpdatedAt` from the last read. Reject unknown
fields, including release key, lifecycle state and candidate identity. Existing create
and read contracts remain compatible.

Only current workspace owners, admins and leads using organization access tokens may
edit Draft or Active releases. Released and Cancelled releases are read-only. API-token
scopes and MCP operations do not expand. Authorize before accessing tenant resources.
An environment must belong to the same workspace and project and be active when newly
assigned. An unchanged archived environment may remain while other metadata is corrected.

Use one tenant transaction and explicit organization predicates. Share-lock the project,
lock the release for update and share-lock a newly assigned environment, serializing
edits with lifecycle transitions and environment archival. A differing stale write
returns `409 release_changed`; strictly advance the millisecond `updatedAt` timestamp
under the lock. An identical request returns the current release without another write,
audit record or integration event, including when retrying after a lost response. No
historical response is replayed if intervening changes differ from the requested state.

Each actual edit appends `release.updated` audit metadata and the durable
`releases.release_updated` integration event in the same transaction. Record changed
field names and environment identities without user-authored free text. Lifecycle
history records lifecycle transitions only. Candidate identities, evidence, policy
versions, evaluations, decisions and waivers are untouched. Environment is release
context, not an input that reinterprets an existing candidate decision.

The UI offers Edit release on mutable releases. Preserve form input across background
refreshes and recoverable failures. After a conflict, require an explicit reload labelled
as discarding edits before resubmission. Save invalidates shared release and environment
views and returns to the release detail page.

## Compatibility and recovery

No database migration or backfill is required. Existing timestamp precision, tenancy,
constraints, RLS and append-only records are retained. Generate OpenAPI and Angular
contracts together. Rolling back removes the edit surface while retaining metadata and
audit/events already written; consumers continue to tolerate unknown event names.

## Verification

Cover field validation, roles, terminal states, workspace/project isolation, environment
archival races, concurrent edits, identical retries and atomic audit/event behavior with
real PostgreSQL. Verify input preservation, conflict recovery and the new action in
Angular tests. Exercise missing-environment correction, reload, conflict recovery,
terminal state, mobile layout and unchanged candidate/decision history in an isolated
browser database.
