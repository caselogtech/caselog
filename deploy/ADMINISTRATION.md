# Managed customer administration

The managed staff console is available at `/staff`. It is unavailable in self-hosted
mode. Workspace owners administer their own workspace through its settings instead.
Staff grants are independent of workspace and billing-account membership.

## Access

A managed deployment uses `CASELOG_DEPLOYMENT_MODE=managed`. Bootstrap the first staff
owner with `CASELOG_STAFF_BOOTSTRAP_EMAIL` set to an existing verified identity and
`CASELOG_STAFF_BOOTSTRAP_ACCESS_HOURS` between 1 and 168. Remove the bootstrap setting
after provisioning. Existing grants are not silently renewed. Staff owners manage
subsequent time-limited operator grants in `/staff/operators`; privileged changes
require a reason and are audited. Keep managed billing disabled for the free pilot.

Only staff admins and owners can view workspace contacts and details. Support operators
cannot access this directory. A staff grant never grants customer-content access.

## Find a customer workspace

Open **Workspaces**, search by name, slug or owner email, and filter by **Not deleted**
or **Deleted**. Select a workspace name to open its card. The card shows the current
owner's name and email, workspace identity, creation/deletion dates, optional billing
account and resource counts. Missing owner contacts are shown explicitly.

A workspace count is not a company count. **Current workspaces** means not deleted;
registered users and resource totals do not establish recent human activity.

## Preserve directory navigation

Applied search, workspace state, page size and cursor are kept in the directory URL.
Browser back/forward restores them, and card links provide **Back to directory** with
the original filters and page, including after following owner/workspace links.
Return destinations are limited to staff directories; external destinations are ignored.

Shared and reloaded URLs preserve the current page. **Previous** uses pages visited
in the current browser tab (up to 100 remembered transitions, isolated by staff identity
and role). Use **First page** when opening a deep link without that navigation history.
Invalid filter links display a reset action and do not issue an unfiltered request.
Only applied filter values are stored in URLs; editing a form does not issue a request.

## Inspect a user

Open **Users**, search by name or email, and select a name. The card shows registration,
verification and deletion state plus a paginated list of current workspace memberships
and roles. Workspace links open staff metadata cards; owner names in workspace cards
link back to the user's card. Email links open the operator's mail client and do not
send a message automatically.

Removed memberships are excluded. Retained memberships in deleted workspaces remain
visible with a deleted label and do not imply usable access. **Workspace memberships**
counts non-deleted relationships, including those in deleted workspaces. Deleted users
remain inspectable as retained metadata. A known user with no memberships has an empty
list; an unknown user returns not found. The card cannot change roles or verification.

Session API clients use `GET /api/v1/staff/users/{userId}` with `cursor` and `limit`
(1–100). The response contains `user`, `workspaces` and `nextCursor`; workspace UUIDs
provide deterministic ordering. Pagination reads live metadata, so changes between
pages are possible. The same admin/owner restrictions apply as for workspace cards.

## Filter staff audit

Staff owners open `/staff/audit`. Admin and support roles cannot read staff audit.
Search the operator by name or email; substring matching is case-insensitive and treats
percent/underscore literally. Action, target type and target ID filters are exact,
case-sensitive values. For example, use `staff.operator.granted` and `staff_operator`
to find grants. All non-empty filters are combined with AND.

Event times and filter inputs use UTC. **From** is inclusive and **Until** is exclusive;
Until must be later than From when both are supplied. Invalid input stays in the form
and does not change the applied filters. Reset clears filters and returns to the first
page. Filtered URLs survive pagination, reload and browser back/forward.

The session API is `GET /api/v1/staff/audit-logs` with `q` (operator name/email, 2–100
characters), `action` (1–100), `targetType` (1–80), `targetId` (1–200), `from`, `to`,
`cursor` and `limit` (1–100). Timestamps are UTC ISO 8601 in years 0001–9999 with at most
millisecond precision. Existing ascending event-UUID cursor ordering is preserved;
a date filter does not change ordering to newest-first. Previously ignored audit `q`
now searches the actor. Requests without filters retain their existing behavior.

Filtering does not rewrite audit history or change operator grants. Role, expiry and
revocation are checked on each request and again by the database projection. The API
response remains the existing `auditLogs` / `nextCursor` envelope.

## Understand usage

- Members and projects count non-deleted records.
- Current test cases and runs exclude deleted records and deleted projects.
- Open test runs have active status; draft runs are not open runs.
- Ingestion attempts include successful and failed imports across retained history.
- Accounted storage follows storage reconciliation and may lag object changes.
- Pending uploads count incomplete, unexpired reservations. Reserved bytes are shown
  separately from accounted storage.

Each card includes a snapshot timestamp. Use **Refresh usage** for current values.
These figures do not enforce quotas or define charges. The console does not expose
customer test content, evidence, attachment objects, secrets or impersonation.

API clients use session authentication with `GET /api/v1/staff/workspaces` and
`GET /api/v1/staff/workspaces/{workspaceId}`. Lists accept `q` (2–100 characters),
`state` (`all`, `current`, `deleted`), `limit` (1–100) and cursor pagination.
Organization/API tokens are not accepted. Unknown workspace IDs return not found.
