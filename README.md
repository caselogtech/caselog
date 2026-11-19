# Caselog

Open-source release readiness with built-in manual and automated test management.

**Can this exact build be promoted safely, and what is blocking it?** Caselog connects
test cases, manual runs, and CI results to immutable release candidates, versioned
policies, and explainable decisions.

Current version: **0.1.0 MVP**, intended for evaluation and feedback. See the
[release notes](CHANGELOG.md) and [compatibility policy](SUPPORT.md).

## Self-hosted and cloud

Self-host the complete core product without a license fee or Caselog account.
The planned cloud pilot is free, with published operational limits and no payment
card or billing account required. Both use the same application and core features.

Paid managed hosting and services may follow after demand and costs are validated.
There is no scheduled trial expiry or automatic paid transition. See the
[roadmap](ROADMAP.md) for the launch plan and commercial direction.

## Local development

Requires Node.js **24.18.0** (`.nvmrc`), pnpm **10.15.0**, and Docker with Compose v2.
From a fresh checkout:

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Open the web app at `http://localhost:4200` and API docs at
`http://localhost:3000/api/v1/docs`. Demo seed data is for local development only.

## Documentation

- [Self-hosting and public signup](deploy/README.md) · [Backup and recovery](deploy/RECOVERY.md)
- [Product guides](apps/docs/README.md) · [CLI](apps/cli/README.md) · [CI examples](examples/ci/README.md)
- [Agent access through MCP](apps/mcp/README.md)
- [Development and verification](CONTRIBUTING.md) · [Architecture](ARCHITECTURE.md)
- [Security reporting](SECURITY.md) · [Public website](apps/site/README.md)

## License

[AGPL-3.0-only](LICENSE); the standalone [CLI uses MIT](apps/cli/LICENSE).
See [notices and source availability](NOTICE.md), [trademarks](TRADEMARKS.md), and
the [code of conduct](CODE_OF_CONDUCT.md).
