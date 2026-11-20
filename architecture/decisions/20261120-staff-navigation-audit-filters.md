# Staff navigation and audit filters

- Status: Accepted
- Date: 2026-11-20
- Scope: User-requested directory navigation and audit filtering

## Decision

Directory URLs own applied search, workspace state, page size and cursor. Browser
back/forward and reload restore those values. Unsaved input remains local until
applied. Invalid URL filters do not trigger an unfiltered request; the UI offers reset.
Card links propagate a bounded, validated return destination restricted to the three
staff directories. Nested return destinations and external routes are never followed.

Previous-page links are navigation state rather than server state. A staff-local,
operator/role-scoped map remembers at most 100 visited page transitions across routed
component destruction. Reload/shared URLs retain the current page; First page is
available when no previous transition is known. No unbounded cursor trail is embedded
in URLs or persisted to storage. Existing REST cursor semantics remain unchanged.

Extend the owner-only staff audit endpoint with operator name/email substring search
(`q`), exact `action`, `targetType`, `targetId`, and UTC `from` inclusive / `to` exclusive
filters. Bounds have millisecond precision, valid years 0001–9999, and `from < to` when
both are present. Inputs are bounded and reject null characters. Operator substring
search treats percent and underscore literally. Filters combine with AND.

The response and ascending UUID cursor order remain compatible. Previously ignored
audit `q` now searches the actor. Old clients omitting filters retain their results.
A new narrow SECURITY DEFINER function checks live staff owner authority, uses an
empty search path and denies PUBLIC execution. It returns the existing audit projection;
records, append-only protections, tenant RLS and staff grants remain unchanged. The
browser scopes audit cache by operator/role and keeps applied filters/cursor in its URL.

## Migration and recovery

Apply `20261120190000_staff_audit_filters` before the new artifacts. It only adds a
function; no backfill, data rewrite or existing function change is required. Old
binaries continue using the original projection. Roll back application artifacts and
leave the unused function in place if recovery is needed. Self-hosted staff API/UI
remain unavailable, and managed billing stays disabled during the pilot.

## Acceptance

Verify directory/card round trips, shared links, reload, browser history, malformed
filters and unsafe return targets. Verify audit filter combinations, literal operator
search, UTC boundaries, cursor pagination, empty results, validation, live roles,
expiry/revocation and self-hosted denial in HTTP/SQL. Confirm audit immutability and
exercise both workflows in the managed browser. Update roadmap items only after checks.
