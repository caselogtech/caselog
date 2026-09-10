# Changelog

## Unreleased

Changes after the 0.1.0 baseline belong here until the next release is prepared.

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
