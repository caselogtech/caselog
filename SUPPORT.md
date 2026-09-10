# Compatibility and release policy

Caselog is under active development at version `0.1.0`, the first numbered MVP baseline.
See [CHANGELOG.md](CHANGELOG.md) for included capabilities and limitations. There is no supported stable
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

All application, CLI, shared-schema, and documentation package versions move together:

- `0.1.1`, `0.1.2`: compatible fixes, security corrections, and operational improvements.
- `0.2.0`, `0.3.0`: new capabilities or explicitly documented incompatible changes before 1.0.
- `1.0.0`: a deliberate stability commitment, requiring supported upgrade paths,
  published compatibility boundaries, and operational acceptance; not a target date.

The product version does not rename `/api/v1` or the CLI JSON envelope version `1`.
Documentation corrections may be published without a new product version when they
describe the same behavior. Migration and recovery requirements apply even to patches.

To prepare a release, update the root and workspace manifests, the OpenAPI document
version, this policy's current baseline, and the changelog. Regenerate OpenAPI, refresh
the lockfile, and run `pnpm check`, `pnpm test`, `pnpm build`, browser and deployment
checks. `pnpm release:check` prevents package/OpenAPI version drift. After reviewing
the verified commit, create an immutable annotated `vX.Y.Z` tag. Pushing a tag, publishing
images/packages, and deploying documentation are separate explicit operations.

Deployment configuration keeps a source-revision image tag by default so different
commits cannot silently reuse a release image name. For a declared release, build from
its exact tag and set `CASELOG_VERSION` to `X.Y.Z` and `CASELOG_REVISION` to its full
commit hash in operator configuration. Preserve secrets on upgrade and retain the
resulting image digests. A semantic version alone does not identify a reproducible image.

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
