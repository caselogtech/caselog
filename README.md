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

Caselog is intended to run as a complete self-hosted OSS product. An optional managed
service will operate the same application artifacts and features for teams that do not
want to run it themselves. Its planned shared-service launch offer is USD 199 per billing
account/month with unlimited users, workspaces, projects, and product features, plus
published allowances for cost-driving infrastructure usage. A billing account is only a
commercial grouping: every workspace remains an independently authorized RLS tenant.

## Architecture

Caselog is a feature-first modular monolith. Module boundaries, dependency
direction, backend layers, tenant isolation, and frontend structure are defined in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Local development

Requirements: Node.js from `.nvmrc`, pnpm 10, Docker with Compose.

```bash
corepack enable
pnpm install
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

Regenerate the committed OpenAPI document and frontend TypeScript contract after a
public API change:

```bash
pnpm openapi:generate
```

## CLI

The `@caselog/cli` workspace provides streaming, idempotent JUnit uploads for CI
pipelines. It will also become the machine-facing candidate/readiness workflow as that
domain is implemented. See [apps/cli/README.md](apps/cli/README.md) for current usage.

## CSV imports

The API exposes separate preview and atomic commit endpoints under
`/api/v1/projects/:projectSlug/imports/csv`. A mapping selects the CSV columns for
title, section, template, automation ID, preconditions, expected result, and content.
Imports are limited to 1,000 rows and 5 MB per request; commit requests require an
`Idempotency-Key` header. For `steps` cases, the content cell accepts either a JSON
array of steps or one `action => expected result` pair per line.

## License

The intended server and web license is AGPL-3.0-only, with the Caselog name and marks
reserved. The root license and trademark files have not been published yet, so the
public licensing package is not complete.
