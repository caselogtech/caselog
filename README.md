# Caselog

Open-source release readiness with built-in manual and automated test management.

Caselog is being built to answer one question for an immutable release candidate:
**can it be promoted safely, why, and what is blocking it?** Native test runs and
external evidence feed deterministic, explainable policies that can be inspected by a
person and enforced by CI.

The repository is under active development. Test management, immutable release
candidates, normalized evidence, versioned readiness policies, deterministic decisions,
waivers, and their primary UI workflows are usable in development. The committed feature
set is now closed while those capabilities are hardened for real self-hosted use.

Caselog is a free, self-hostable OSS product. The initial hosted offering is
also planned to be free so companies can try real workflows and help validate the
concept and demand. Teams can create workspaces, invite colleagues, and use the core
features without a subscription, payment card, or billing account. Each workspace
remains an independently authorized tenant.

Hosted and self-hosted installations use the same application artifacts and features.
There is no scheduled trial expiry or automatic switch to paid access. Any future
commercial offering will be a separate decision after real usage and demand are
established. Operators provide hosting, storage, and email infrastructure; operational
safety limits may apply independently of payment.

## Free evaluation and workspace creation

The existing application supports onboarding without billing. For an instance where
companies can register and create their own workspaces, use these API settings:

```dotenv
CASELOG_REGISTRATION_MODE=public
CASELOG_WORKSPACE_CREATION_ENABLED=true
CASELOG_MANAGED_BILLING_ENABLED=false
CASELOG_MAX_WORKSPACES_PER_USER=
```

An empty workspace limit means unlimited workspaces per user. Users register, verify
their email, create a workspace, and invite their team. The creator becomes its owner;
access to each workspace requires explicit membership. No payment setup is part of
this flow, including when the deployment mode is `managed` with billing disabled.

The local development example already uses these settings. The production Compose
example enables workspace creation and disables billing, but defaults to registration
by invitation. Follow [public evaluation setup](deploy/README.md#public-evaluation)
to allow companies to join independently.

## Architecture

Caselog is a feature-first modular monolith. Module boundaries, dependency
direction, backend layers, tenant isolation, and frontend structure are defined in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Local development

For a deployment with HTTPS, separate database roles and versioned application images,
follow the [self-hosting guide](deploy/README.md). The root Compose stack below is for
local development.

Requirements: Node.js from `.nvmrc`, pnpm 10, Docker with Compose.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

- API: `http://localhost:3000/api/v1/health`
- OpenAPI UI: `http://localhost:3000/api/v1/docs`
- OpenAPI JSON: `http://localhost:3000/api/v1/openapi.json`
- Web: `http://localhost:4200`
- MinIO console: `http://localhost:9001`
- Mailpit: `http://localhost:8025`

## Verification

```bash
pnpm check
pnpm test
pnpm build
```

API integration tests require PostgreSQL, object storage, and SMTP from the local
Compose stack and configuration based on `.env.example`. Use a dedicated empty
test database: global bootstrap tests intentionally assume no existing operators.
API tests explicitly drain a controlled queue transport to run registered workers;
they do not run scheduled jobs against other test suites or development tenants.

`pnpm check` verifies both the backend-to-OpenAPI contract and the generated frontend
types. Document generation uses disposable configuration without connecting to
external services. Architecture checks enforce public module imports, domain-layer
direction, core/shared isolation, and acyclic Nest module composition.

Production web builds also check the full static JavaScript import graph, including
shared chunks that Angular's summary may label as lazy. The startup budget is 875,000
bytes; non-authentication feature schemas must remain outside that graph. The web proxy
compresses text assets with gzip. Component CSS warnings remain visible for review.

The Chromium smoke journey runs the built frontend, real API, PostgreSQL outbox,
and pg-boss workers. It covers browser login, candidate/CLI/JUnit ingestion,
readiness changes, mobile overflow, audited waivers, and historical decisions:

```bash
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

The runner creates and removes its own random database through
`MIGRATION_DATABASE_URL` (the local database role needs `CREATEDB`). It seeds only
that database and refuses to reuse servers on ports 3137/4317. PostgreSQL, S3 and
SMTP must be available. Failed runs retain local traces under ignored
`test-results/` and `playwright-report/`; the test uses disposable credentials.
No browser retries are configured.

Regenerate the committed OpenAPI document and frontend TypeScript contract after a
public API change:

```bash
pnpm openapi:generate
```

## CLI

The `@caselog/cli` workspace provides candidate creation, test-run linking, evidence
and JUnit ingestion, policy assignment, and readiness evaluation for CI pipelines.
It supports bounded waiting and versioned JSON with stable exit codes. See [apps/cli/README.md](apps/cli/README.md) for current usage.

## CSV imports

The API exposes separate preview and atomic commit endpoints under
`/api/v1/projects/:projectSlug/imports/csv`. A mapping selects the CSV columns for
title, section, template, automation ID, preconditions, expected result, and content.
Imports are limited to 1,000 rows and 5 MB per request; commit requests require an
`Idempotency-Key` header. For `steps` cases, the content cell accepts either a JSON
array of steps or one `action => expected result` pair per line.

## License

Server, web, shared schemas and repository tooling are licensed under
[AGPL-3.0-only](LICENSE); the standalone [CLI is MIT-licensed](apps/cli/LICENSE).
See [notices and source availability](NOTICE.md) and the [trademark policy](TRADEMARKS.md).

Contributors can start with [CONTRIBUTING.md](CONTRIBUTING.md) and the
[code of conduct](CODE_OF_CONDUCT.md). [SECURITY.md](SECURITY.md) defines private
vulnerability reporting; [SUPPORT.md](SUPPORT.md) describes the current compatibility
and release policy.
