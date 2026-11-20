# Managed user cards and workspace relationships

- Status: Accepted
- Date: 2026-11-20
- Scope: First slice of the user-requested administration improvements

## Decision

Extend the existing read-only staff directory with a user card and cursor-paginated
current workspace memberships. Only live staff admins and owners may read it, in
managed mode with session authentication. Return only identity metadata already
available in the user directory and workspace ID, name, slug, role and deletion date.
Staff roles do not become workspace or billing membership, and this view cannot
change roles, verification, ownership or customer access.

Two narrow SECURITY DEFINER projections check current staff authority, deny PUBLIC
execution and use an empty search path. Workspace relationships join explicitly on
organization identity and filter by the selected user. The repository consumes these
projections in one SQL statement; customer-domain tables remain private to their
owners outside this deliberate metadata projection. Tenant RLS remains unchanged.

Removed memberships are excluded. Retained memberships in deleted workspaces are
shown with an explicit deleted label; they do not imply usable access. The existing
`activeWorkspaceCount` contract counts non-deleted memberships, including those in
deleted workspaces. The card calls this count "Workspace memberships". Deleted users
remain inspectable as metadata; their state never grants access. Missing identities
return not found, whereas known users without memberships return an empty page.

The new endpoint is `GET /api/v1/staff/users/{userId}`, with `cursor` and `limit` (1–100).
Its response has `user`, `workspaces` and `nextCursor`. Ordering uses workspace UUID;
pagination reads live metadata and does not claim a historical snapshot across pages.
The browser scopes cached cards to operator identity and role, handles errors locally,
and links only to staff metadata pages. No sessions, credentials, customer contents,
engagement telemetry, suspension, impersonation or billing activation is introduced.

## Compatibility and recovery

Apply additive migration `20261120180000_staff_user_directory` before new artifacts.
There are no table, RLS, existing function or data changes, and no backfill. Old binaries
ignore the new functions. Roll back the application artifacts and leave the unused
functions in place. The same migrations apply in self-hosted installations, where
staff endpoints and UI remain unavailable.

## Acceptance

Verify pagination, missing/empty/deleted records, excluded memberships, resource
whitelisting, anonymous/organization-token rejection, live role/expiry/revocation
checks in HTTP and both database projections, unchanged RLS and self-hosted denial.
Exercise user → workspace → owner navigation in a managed browser and test local
loading/error states and operator cache isolation. Other proposed administration
features remain separately tracked and unimplemented.
