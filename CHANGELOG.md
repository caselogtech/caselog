# Changelog

## Unreleased

Changes after the 0.1.0 baseline belong here until the next release is prepared.

- Add versioned case priorities and frozen candidate test coverage, WCAG 2.2 AA
  automated/manual evidence and Lighthouse gates with pinned sources and measurement
  profiles. Add conflict-safe policy editing and successor drafts, preserving published
  gate inputs and historical decisions. Apply migration
  `20261121190000_quality_policy_scopes` before new artifacts; drain old evaluator
  jobs before stopping old workers, then upgrade artifacts together. New evaluations use evaluator 1.1.0.

- Add Edit release and a version-checked public update endpoint for draft/active release
  names, environments, target dates and external references. Preserve candidate and
  readiness history, audit actual edits, and explain concurrent-write conflicts without
  losing form input. No database migration is required.

- Replace bundled MinIO with digest-pinned SeaweedFS 4.54 in development, CI and
  self-hosted Compose. Keep the S3/API contracts and add a streaming, resumable
  copy-and-verify tool. Existing installations require the
  [storage migration](deploy/STORAGE-MIGRATION.md); physical backups now use format 2.
  Old MinIO volumes are retained. Exclude local caches from Docker/source archives.

- Preserve staff directory search, filters and pagination in shareable URLs and
  through card navigation. Add owner-only staff audit filters for operator, action,
  target and UTC time, with persistent filter URLs and pagination. Apply migration
  `20261120190000_staff_audit_filters` before new artifacts.

- Add managed staff user cards with verification/deletion state, paginated workspace
  roles and navigation between users and workspace metadata. Apply migration
  `20261120180000_staff_user_directory` before new artifacts.

- Add managed staff workspace cards with owner contacts, lifecycle filters and
  timestamped aggregate resource usage, protected by live staff admin/owner grants.
  Self-hosted mode remains unchanged. Apply migration
  `20261120090000_staff_workspace_directory` before new artifacts.

- Extend MCP with suite and nested-section creation, independent `structure:write`
  access, atomic audit and replay-safe writes. Existing browser clients remain
  compatible. Apply migration `20261119190000_mcp_structure_scope` before new binaries.

- Add an optional stdio MCP adapter for project discovery, test-case authoring,
  release-policy drafts/publication and authoritative candidate readiness. Add separate
  API scopes and replay-safe case writes, preserving existing browser clients. Apply
  migration `20261119170000_mcp_authoring_scopes` before deploying these artifacts.
- Add a standalone public homepage and contact page, with static hosting and Docker
  deployment instructions, public email contact, and accessible mobile layouts.

## 0.1.0 — Initial MVP

This is the first numbered MVP baseline. It is intended for evaluation and feedback;
it does not declare a stable API, an SLA, or compatibility with earlier unversioned
production installations. Hosted evaluation is free with billing disabled.

### Included

- Workspaces, explicit memberships, roles, invitations, and tenant isolation.
- Projects, test cases with version history, CSV import, manual test runs and results.
- JUnit ingestion, attachments, integrations, and reporting.
- Immutable release candidates, normalized evidence, versioned readiness policies,
  explainable decisions, freshness handling, and audited waivers.
- Public REST API and CLI workflows for CI, with scoped tokens and deterministic exits.
- Docker installation, separate runtime/database roles, offline backup and restore.
- A separate documentation site covering deployment and core product workflows.
- Exact matching Zod versions across API, web, and shared schemas, preventing the
  production package from resolving a different schema runtime from documentation dependencies.

### Compatibility and known limits

- REST routes remain `/api/v1`; the CLI pipeline JSON envelope remains version `1`.
  These contract versions are independent of the product version `0.1.0`.
- No database migration is introduced by assigning this version.
- Clean installation and same-version recovery have automated coverage. Upgrades from
  earlier unversioned installations require a rehearsal against their own restored data.
- The verified deployment baseline is a single Linux x86_64 Docker host and Chromium.
  High availability, large-data recovery times, and other browser/platform combinations
  have not been established. Component CSS budget warnings remain under review.
- Application images are built from source; this version does not imply that images or
  CLI packages have been published to a registry.

See [SUPPORT.md](SUPPORT.md) for versioning and compatibility, and
[deploy/RECOVERY.md](deploy/RECOVERY.md) before updating an installation.
