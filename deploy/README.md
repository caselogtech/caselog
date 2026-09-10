# Self-hosting Caselog

This deployment example runs the complete self-hosted application on one Docker host.
It is a hardening baseline, not a high-availability deployment or a stable release SLA.
It requires no Caselog account, license server, or managed control plane.

## Prerequisites and topology

Use Linux, Docker Engine with Compose v2 supporting `up --wait`, Node.js 24.18.0 and
pnpm 10.15.0 for configuration and local checks. Start evaluation with 4 CPU cores,
8 GiB RAM and 30 GiB free SSD space, plus space for evidence and backups. These are
starting allocations, not measured capacity guarantees. Image builds need additional
space and memory; build elsewhere and transfer the same tagged images if necessary.

Provide two HTTPS origins and a real SMTP service. The host TLS proxy forwards:

- `https://caselog.example.com` to `127.0.0.1:8080` (web and `/api/v1`).
- `https://objects.example.com` to `127.0.0.1:9090` (S3 object transfers).

Keep PostgreSQL, the API, MinIO console and metrics private. Bind ports to loopback as
in the supplied Compose file. A host-level Caddy example is in [Caddyfile](Caddyfile).
Use your existing TLS proxy if preferred; preserve `Host` on storage requests. S3
signatures require a dedicated origin, not an `/s3` prefix or URL rewriting. See
[MinIO's proxy guidance](https://min.io/docs/minio/linux/integrations/setup-nginx-proxy-with-minio.html).
The bundled storage instance is dedicated to Caselog and uses its generated credentials;
do not share it with unrelated applications. Internal S3 traffic stays on the Docker
network. Presigned URLs use `S3_PUBLIC_ENDPOINT` and never expose `http://minio:9000`.

The expected client address chain is client → host TLS proxy → web → API. The TLS
proxy must replace untrusted forwarded headers. `API_TRUST_PROXY_HOPS=2` matches this
chain; update it if the topology changes. Never expose a shorter path to the API while
trusting two hops. The direct development server defaults to trusting no proxy headers.

## Clean install

Check out an exact reviewed commit. Run from the repository root:

```bash
node scripts/deployment/configure.mjs \
  --web-url https://caselog.example.com \
  --storage-url https://objects.example.com \
  --mail-host smtp.example.com \
  --mail-from 'Caselog <caselog@example.com>'
```

This creates `deploy/.env` with mode `0600`, unique random signing/storage/database
secrets, an encryption key and the source revision. It refuses to overwrite an existing
file. Add `MAIL_USER` and `MAIL_PASSWORD` if required. SMTP defaults to implicit TLS on
465; for STARTTLS use port 587 with `MAIL_SECURE=false`. Use a protected editor or secret
manager and single-quote Compose values containing `$`. Never commit this file or paste
`docker compose config` output into a public issue. Database passwords generated here
are URL-safe hexadecimal; custom passwords must be URL-encoded in connection strings.

Back up the encryption key with configuration. Losing `INTEGRATION_CREDENTIAL_MASTER_KEY`
makes stored integration credentials unreadable. Do not regenerate configuration on
upgrade, and do not rotate database or storage credentials by changing `.env` alone:
existing persistent services and roles must be updated in a coordinated maintenance window.

Define a convenient command in your shell:

```bash
dc() { docker compose --env-file deploy/.env -f deploy/compose.yaml "$@"; }
dc build
```

API, web and migration images have the same version and source-revision labels. Build
from a clean checkout; never move an existing release tag to different source. Retain
these three artifacts together. Building is local: no image is published automatically.
The migration image includes tooling and source; it is an operator-only, short-lived
job. The API contains runtime dependencies and compiled code, and both API and web run
as non-root with read-only filesystems and health checks.

For the first owner, temporarily restrict the TLS proxy to your operator IP, then set
`CASELOG_REGISTRATION_MODE='public'` in `deploy/.env` and start:

```bash
dc up -d --wait --wait-timeout 180
```

Open the HTTPS web origin, register your real email address, follow the verification
email, and create a workspace. Its creator receives explicit workspace ownership.
There is no global customer-data administrator or default production password. Restore
`CASELOG_REGISTRATION_MODE='invitation_only'` and run `dc up -d --wait` before removing
the temporary IP restriction. Existing owners invite additional users through workspace
settings. Alternatively keep public registration deliberately, according to your policy.
Never run the development demo seed on an installation that holds real data.

Startup runs committed migrations using the database owner, provisions separate login
roles, and only then starts the API. `caselog_runtime` can assume `caselog_app`, which is
subject to tenant RLS. `caselog_jobs` owns the pg-boss schema and can create schemas for
queue initialization, but cannot read customer tables. Neither login owns customer tables
or has superuser privileges. PostgreSQL's
owner credential is confined to initialization and operator jobs; it is absent from the
API container. Production startup rejects a database connection that does not use the
`caselog_app` role, HTTP web/storage origins, reused JWT keys and sample JWT secrets.

## Operation and diagnostics

```bash
dc ps
dc logs --tail 100 api
dc run --rm migrate migrate status
dc images
dc exec -T api node -e "fetch('http://127.0.0.1:3000/api/v1/metrics').then(r=>r.text()).then(console.log)"
```

Use container labels to record the exact build, for example
`docker image inspect caselog-api:VERSION --format '{{json .Config.Labels}}'`.
The public health endpoint is `/api/v1/health`; the web proxy's `/healthz` checks only
static serving. Metrics are deliberately unavailable through the public proxy. Scrape
metrics from the private API network with an operator-controlled collector. Logs and
metrics expose background failures and storage reconciliation; do not publish raw logs,
customer identifiers, job payloads, URLs with signatures or database dumps.

Monitor health, job failures and retries, evidence freshness, storage maintenance errors,
SMTP failures, database connections, memory and disk growth. Bound log retention with
your Docker daemon's log rotation settings. A running process alone does not establish
release readiness: stale, missing and failed evidence remain visible product states.
The host is a single failure domain. Database and S3 persistence require coordinated
backup and a tested recovery plan before storing irreplaceable evidence.

`dc stop` stops services and retains volumes. `dc down` removes containers and networking
but retains named volumes. `dc down --volumes` permanently destroys local database and
object data; use it only for an intentional uninstall after confirming backup retention.
Deleting a workspace follows the product's retention/purge lifecycle; removing containers
or rotating application keys is not a substitute for an authorized data purge.

## Repeatable installation check

```bash
pnpm exec playwright install chromium
pnpm test:deployment
```

The check requires Docker, OpenSSL and a local Chromium installation. It builds all three
images, creates a random Compose project and isolated volumes, supplies ephemeral test
TLS certificates and SMTP, then checks registration, email verification, first workspace
ownership, secure cookies, real browser login and database role isolation. Cleanup removes
only that random project's volumes. It never seeds or modifies an existing installation.
Use `pnpm test:deployment --skip-build` only when the `hardening` images were just built
from the code under test. This automated check does not replace an unfamiliar operator's
installation exercise or a previous-release compatibility drill.
