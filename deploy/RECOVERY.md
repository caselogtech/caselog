# Backup, restore and upgrades

These scripts support the bundled single-host Compose deployment, its named volumes,
and the pinned PostgreSQL/MinIO images. They are **offline physical snapshots**, not
online backups, point-in-time recovery, cross-architecture migration or a PostgreSQL
major-version upgrade mechanism. Do not apply them to external storage/databases or
custom volume mappings without a separately tested backup procedure.

## Backup

Reserve a maintenance window, stop incoming traffic at the TLS proxy, and ensure no other
operator or scheduler changes the installation until backup finishes. Keep enough free
space for both compressed volumes. Run from the repository root:

```bash
node scripts/deployment/backup.mjs \
  --env-file deploy/.env \
  --output /protected/backups/caselog-2026-09-10
```

The destination must not exist; its parent directory must exist. Add `--project NAME`
if you installed with a custom Compose project. The script verifies the running images,
stops web/API before storage/database, streams both volumes without loading them into
memory, and copies configuration. It writes checksums and an exact image/architecture
manifest last, then resumes only services that were previously running. A missing
`manifest.json` means an incomplete backup. The manifest's `snapshotAt` records when
all writers were stopped; `createdAt` records archive completion. If interrupted, services
may remain stopped. If restart fails, inspect service health
before reopening traffic. Never copy a live PostgreSQL or MinIO data directory directly.

The backup contains customer data, authentication material, storage credentials and the
integration encryption key. Files are mode `0600` in a `0700` directory, but they are
**not encrypted by the script**. Use an encrypted backup target, restrict its readers,
and transfer a verified copy off-host. Protect transport and encryption keys separately.
Checksums detect damage; they do not authenticate an untrusted backup. Restore only
archives from your trusted backup system.

Retain the exact API, web, migration, PostgreSQL and MinIO images named in the manifest,
plus this source checkout and operator configuration. Export local application images
with `docker image save` or store them in your private registry. Do not overwrite version
tags. A source revision alone does not preserve a previously built image ID. Keep TLS
proxy, DNS, SMTP and external secret-manager configuration separately; they are outside
these two volumes. Define retention, backup frequency and deletion rules for your own
RPO, storage budget and customer commitments. The scripts do not delete older backups.

## Restore into an isolated target

1. Choose a fresh Compose project and a host with the same CPU architecture. Load the
   exact images recorded in the manifest. Use the backed-up source checkout and Compose
   configuration; do not restore physical data directly into newer database/storage images.
2. Copy `configuration.env` to a protected target `.env` file. Keep all secrets unchanged.
   Adjust only host ports, HTTPS origins and SMTP routing needed for an isolated recovery
   environment. Restrict outbound connectivity: restored jobs and integrations must not
   deliver duplicate email/webhooks or reach live third-party systems during a drill.
3. Verify and restore, without starting services:

```bash
node scripts/deployment/restore.mjs \
  --backup /protected/backups/caselog-2026-09-10 \
  --env-file /protected/recovery.env \
  --project caselog-recovery
```

The script refuses corrupted/incomplete backups, changed secrets, different images or
architecture, and any project/volume that already exists. It creates new database and
object volumes; it does not overwrite the source installation or start background jobs.
If extraction fails, keep the target stopped, investigate, and choose another empty
project or explicitly remove only the failed target's volumes before retrying.

After verifying network isolation, start the restored stack:

```bash
docker compose -p caselog-recovery --env-file /protected/recovery.env \
  -f deploy/compose.yaml up -d --wait --wait-timeout 180
```

Check login, workspace ownership and tenant isolation; compare historical readiness
decisions and their evidence; download representative attachments and verify content
checksums; inspect queue failures, storage reconciliation, migration status and disk use.
The queue is restored with the database. Delivery retries remain idempotent according to
each handler's contract; restoration cannot undo messages already sent outside Caselog.
Existing evidence may have expired during downtime and must be evaluated as stale, not
rewritten as fresh. Keep the original installation stopped before switching traffic to
the recovered one. Record recovery duration and the recovered backup timestamp.

`pnpm test:deployment` performs a complete local drill: realistic cases, runs, candidates
and contrasting historical decisions are seeded only in its random test project; a real
browser uploads an object; backup resumes the source; corruption and nonempty-target
checks reject unsafe restores; a second isolated project restores the DB, queue and file;
login, ownership, immutable history and byte-for-byte download are verified. These small
fixtures do not establish recovery time for a large installation; measure your own data.

## Upgrade and rollback

There is no declared stable release series yet. Upgrade from an exact reviewed commit,
read its migration recovery notes under `apps/api/prisma/migrations`, and rehearse against
a restored copy of your own backup before touching live data. Never skip that rehearsal
for database, queue or object-storage version changes.

1. Take and verify an offline backup and retain the old images and configuration.
2. Restore it into an isolated project and verify the old version first.
3. Check out the target source; update only `CASELOG_VERSION` and `CASELOG_REVISION` in a
   copy of the existing configuration. Build all three application images together.
4. Stop restored web/API, run the new migration image, and start the new application:

```bash
dc stop web api
dc run --rm migrate migrate deploy
dc up -d --wait --wait-timeout 180
```

Here `dc` must point to the isolated target's project and configuration. Run workflow,
API/CLI, tenant isolation, queue, storage and historical-decision checks. Only after they
pass, repeat the same maintenance procedure on the live installation and record evidence.

Prefer a documented roll-forward correction for failed migrations. Binary-only rollback
is safe only when that migration's recovery notes explicitly preserve compatibility.
Do not automatically run `down.sql`, rewrite migration history or remove enum values.
For an incompatible or destructive change, restore the **pre-upgrade database, object
volumes, secrets and matching application images together** into a new project. This
loses all writes after the backup timestamp and cannot retract external messages; account
for that before directing traffic to the recovered installation.

The automated drill currently proves clean install and recovery of the same pinned
version. It does not claim compatibility with an untested previous production release.
