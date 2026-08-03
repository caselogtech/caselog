# Caselog

Open-source test management for manual and automated testing.

The repository is under active development.

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
- Web: `http://localhost:4200`
- MinIO console: `http://localhost:9001`
- Mailpit: `http://localhost:8025`

## Verification

```bash
pnpm check
pnpm test
pnpm build
```

## CLI

The publishable `@caselog/cli` package provides streaming, idempotent JUnit uploads
for CI pipelines. See [apps/cli/README.md](apps/cli/README.md) for usage.

## License

Server and web application code are licensed under AGPL-3.0-only. The Caselog name and marks are reserved.
