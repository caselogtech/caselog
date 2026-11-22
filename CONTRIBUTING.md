# Contributing to Caselog

Start with [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [AGENTS.md](AGENTS.md).
The committed product scope is closed while correctness, UX, accessibility, performance,
operations and documentation are hardened. Discuss new feature categories and irreversible
API, schema or security changes before implementing them.

## Development

Use Node.js 24.18.0 from `.nvmrc` and pnpm 10.15.0 from `package.json`. On a fresh clone:

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Existing MinIO installations must follow [the storage migration guide](deploy/STORAGE-MIGRATION.md)
before starting the updated stack. Never attach a MinIO volume to SeaweedFS.

The seed is for disposable development data only. Do not overwrite an existing `.env`.
Use a separate empty PostgreSQL database for integration tests and configure
`MIGRATION_DATABASE_URL`, `DATABASE_URL` with the `caselog_app` role, and `JOB_DATABASE_URL`
for that database. Local services are available at these addresses:

- Web: `http://localhost:4200`
- API health: `http://localhost:3000/api/v1/health`
- OpenAPI UI: `http://localhost:3000/api/v1/docs`
- OpenAPI JSON: `http://localhost:3000/api/v1/openapi.json`
- SeaweedFS S3 endpoint: `http://localhost:9000` (authenticated; no public storage console)
- Mailpit: `http://localhost:8025`

Use `pnpm docs:dev` for the [documentation site](apps/docs/README.md) and
`pnpm site:dev` for the [public website](apps/site/README.md).

The API watcher writes to `apps/api/.cache/dev`; production builds and OpenAPI checks
write to `apps/api/dist`. These outputs are separate so verification can run while
`pnpm dev` remains active.

Keep code, technical documentation and product text in English. Follow the existing
formatter, module layout, public APIs and semantic Transloco keys. A change to tenant data
must preserve organization scoping, server-side authorization, constraints and RLS.
Readiness decisions and their source evidence/policies are separate historical records;
never rewrite history to make a current result look better.

## Verification and review

Run `pnpm check` and relevant tests for code changes. Run `pnpm test` and `pnpm build`
for broad or cross-workspace changes; run `pnpm test:browser` for critical browser
workflows and `pnpm test:deployment` for deployment/recovery changes. The latter requires
Docker, OpenSSL and Chromium and creates only disposable projects. Regenerate both API
contracts with `pnpm openapi:generate` when public schemas/endpoints change. Validate
migrations against real PostgreSQL and describe recovery proportional to the risk.

```bash
pnpm check
pnpm test
pnpm build
```

`pnpm check` verifies formatting, lint, translations, types, module boundaries,
OpenAPI/frontend contract drift, and release versions. OpenAPI generation uses disposable
configuration without connecting to external services. Production web builds also check
the complete static JavaScript startup graph against an 875,000-byte budget;
non-authentication feature schemas stay outside that graph. Component CSS budget
warnings remain visible for review.

API integration tests require PostgreSQL, object storage, and SMTP from the local
Compose stack. Use a dedicated empty test database: global bootstrap tests assume
no existing operators. Tests drain a controlled queue transport rather than running
scheduled jobs against development tenants or other suites.

For the critical Chromium journey:

```bash
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

The runner uses the built frontend, real API, PostgreSQL outbox, and pg-boss workers.
It covers login, candidate/CLI/JUnit ingestion, readiness changes, mobile overflow,
audited waivers, and historical decisions. It creates and removes a random database
through `MIGRATION_DATABASE_URL`; the local database role needs `CREATEDB`. PostgreSQL,
S3, and SMTP must be available. The runner seeds only that database and refuses to
reuse servers on ports 3137/4317. No browser retries are configured. Failed runs retain
traces under ignored `test-results/` and `playwright-report/` directories.

Documentation-only changes need formatting, link/path review and `git diff --check`.
Report what actually ran, including failures or blocked checks. Do not mark an acceptance
checkpoint complete based only on a happy-path test.

Keep pull requests focused. Explain the user-visible problem, final behavior, boundary
and tenancy implications, verification and remaining limitations. Use the PR checklist;
include screenshots for material UI changes and migration/recovery notes when relevant.
Use imperative commit subjects with the repository's `[FIX]`, `[FEAT]`, `[REFACTOR]`,
`[PERF]`, `[TEST]`, `[DOCS]`, `[BUILD]` or `[CHORE]` prefix.

Never commit `.env`, tokens, evidence exports, runtime data, `.vscode/`, or the ignored
local `docs/` directory. Public decisions must remain understandable from tracked files.
Only submit work you have the right to contribute, under the license of its destination:
AGPL-3.0-only by default, MIT for the standalone CLI, and upstream licenses for third-party
assets. Preserve notices; document the source and license of any new bundled asset.

Follow the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities through
[SECURITY.md](SECURITY.md), not the public bug template. Compatibility and release policy
are in [SUPPORT.md](SUPPORT.md).
