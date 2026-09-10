# Compatibility and release policy

Caselog is under active development at version `0.0.0`. There is no supported stable
release series, automatic upgrade guarantee or managed-service SLA yet. Pin an exact
reviewed commit and retain all application images, configuration and recovery evidence.

| Surface | Current verified baseline |
| --- | --- |
| Node.js | 24.18.0 (`.nvmrc`); use the pinned version rather than the wider manifest range |
| pnpm | 10.15.0 (`packageManager`); frozen lockfile installs |
| API/web | NestJS 11, Fastify 5, Angular 22 and the checked-in lockfile |
| Database | PostgreSQL 16; production Compose pins a concrete image digest |
| Object storage | The MinIO image pinned in production Compose; other S3-compatible systems require endpoint, checksum, presigned URL and CORS validation |
| Deployment | Single Linux Docker host (x86_64 verified), same architecture and exact images for physical recovery |
| Browser | Chromium from pinned Playwright 1.63.0 in CI; Firefox, WebKit and other browser versions have no declared verification matrix yet |
| CLI | JSON envelope version 1 and documented exit codes in `apps/cli/README.md` |

Before declaring a stable release, publish its release notes, exact image digests,
supported upgrade origins, migration/recovery requirements and known limitations.
Use semantic version tags for declared releases; never replace an existing tag with
another artifact. Before 1.0, a minor release may contain incompatible changes, but they
must still be explicit in release notes and accompanied by a migration/recovery plan.
After 1.0, breaking public API/CLI behavior requires a major release.

Deprecations must identify the replacement, affected contracts and intended removal
release before removal. Do not promise a support window or backport branch until it is
actually maintained. Security fixes follow [SECURITY.md](SECURITY.md).

Schema migrations move forward from committed history. Never edit an applied migration
or use `db push` to upgrade an installation. Read each migration's recovery notes;
binary rollback is not automatically database rollback. Follow the
[upgrade and restore runbook](deploy/RECOVERY.md). Same-version recovery is automated;
compatibility with an older production release must be tested explicitly before it is
claimed. Self-hosted and future managed installations use the same core artifacts and
features; managed billing never grants implicit access to a workspace.
