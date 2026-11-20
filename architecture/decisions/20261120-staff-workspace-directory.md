# Managed workspace customer directory

- Status: Accepted
- Date: 2026-11-20
- Scope: User-approved read-only customer administration

## Context

The operator needs to understand which workspaces exist, contact their owners and
inspect resource usage before inviting a pilot cohort. A workspace is the tenant;
it is neither a company nor a person. Registration and non-deleted status alone do
not prove engagement. Billing stays disabled during the pilot.

## Decision

Extend the existing managed-only staff console with a searchable, cursor-paginated
workspace directory, current/deleted filters and a workspace detail page. Only
unexpired staff admins and owners may access owner contacts and resource snapshots.
Support operators retain their existing lower privileges. Workspace membership,
billing membership and staff grants remain independent.

The public API exposes only a whitelisted projection: workspace identity, current
owner contact, optional billing account, membership/project counts, accounted storage,
case/run counts, ingestion attempts and outstanding upload reservations. Owner contact
is the current non-deleted owner membership with a non-deleted identity; missing
contacts remain explicitly unknown. No new activity tracking is introduced.

Two narrow PostgreSQL SECURITY DEFINER functions own this global projection. They
check live staff grants, use an empty search path, deny PUBLIC execution and include
explicit organization predicates for tenant aggregates. The staff repository calls
these functions using authenticated session identity; it does not query foreign
feature tables. Tenant RLS and customer-domain authorization remain unchanged. Staff
cannot retrieve test content, results, evidence, attachment objects or credentials.

A detail response reads its counters in one SQL statement and includes an observation
timestamp. Cases and runs exclude deleted records and deleted projects; open runs
have active status. Ingestions count retained attempts, including failures. Pending
uploads are incomplete and unexpired; reserved bytes are separate from reconciled
storage accounting. These counters are resources, not active users, quotas or billing.

## Compatibility and recovery

Apply additive migration `20261120090000_staff_workspace_directory` before the new
artifacts. Existing projection functions remain available for older binaries; no
backfill or tenant data rewrite is necessary. Existing list fields remain unchanged;
owner is an additive nullable response field, state defaults to all, and the detail
endpoint is new. Roll back application artifacts and leave the unused functions in
place if recovery is needed. The same migrations apply in self-hosted mode, where
staff API and UI remain unavailable.

## Acceptance and limits

Verify authorization at HTTP and database boundaries, anonymous and organization-token
rejection, expiry/revocation, cross-tenant aggregate isolation, unchanged RLS, missing
owners, deleted workspaces, pagination, precise byte values and unknown IDs. Exercise
the managed directory-to-detail journey in a disposable database and the UI's loading,
error and mobile states. No suspension, customer-content support access, impersonation,
quotas, company grouping, billing activation or engagement telemetry is authorized.
