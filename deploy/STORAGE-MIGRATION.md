# Migrate MinIO objects to SeaweedFS

Fresh installations use SeaweedFS directly. Existing installations need an offline
S3 copy before switching storage; database attachment references and object keys stay
unchanged. Do not mount MinIO physical files into SeaweedFS or delete the old volume.
This procedure covers a dedicated, unversioned Caselog bucket. It copies current
objects, not version history, tags, ACLs, object-lock/legal-hold state, bucket policies or IAM.
If your bucket uses those features, stop and plan their migration separately.

## Prepare and stop writers

1. Retain the old source checkout, Compose configuration, MinIO image, credentials,
   and a verified consistent database/object backup made with the old backup tooling.
   Preserve `object-data` (production) or `minio-data` (development). Ensure space for
   the old volume, the new volume and backups. Never use `down --volumes` on the source.
2. Close public traffic at the proxy and stop **all** API/web instances and job workers.
   Disable direct clients and wait for outstanding upload URLs to expire (up to the
   configured `S3_UPLOAD_URL_TTL_SECONDS`, at most one hour). Keep writers stopped until
   cutover verification finishes. Do not migrate from an actively changing bucket.
3. Keep the original MinIO service running using the retained old checkout/configuration.
   Start only the new `seaweedfs` service, with a different loopback port and its new
   `seaweedfs-data` volume. Use the same credentials/bucket as the application:

```bash
# Production example; the original MinIO S3 port remains 9090.
S3_BIND_PORT=19090 docker compose --env-file deploy/.env \
  -f deploy/compose.yaml up -d --wait seaweedfs
```

In development the new service publishes port 9000. If the original MinIO uses it,
keep SeaweedFS stopped until you recreate the old MinIO service on another loopback
port using its retained image/configuration and the **same old MinIO volume**. Start
only one MinIO process on that volume. Then run `docker compose up -d --wait seaweedfs`.
Do not include a stale local Compose override that still adds a `minio` service.

Only the authenticated S3 port may be published. The new image's `/data` includes both
object files and filer metadata; retain the whole volume. Its other ports stay private.

## Copy and verify

Create two protected files, mode `0600`, outside version control. Each must contain:

```dotenv
S3_ENDPOINT=http://127.0.0.1:9090
S3_REGION=us-east-1
S3_BUCKET=caselog
S3_ACCESS_KEY=replace-with-existing-access-key
S3_SECRET_KEY=replace-with-existing-secret-key
S3_FORCE_PATH_STYLE=true
```

Use the original endpoint/credentials in `source.env` and the new endpoint/credentials
in `target.env` (port 19090 in the production example). Never use the public HTTPS origin
for this offline transfer or print the files in logs. The destination bucket must already
exist; bundled SeaweedFS pre-creates it. Install the pinned workspace dependencies, then:

```bash
node scripts/deployment/migrate-object-storage.mjs \
  --source-env /protected/source.env \
  --target-env /protected/target.env \
  --report /protected/migration-report.json
```

The tool streams one object at a time, preserves keys, user metadata and HTTP content
headers, and verifies source/destination bytes with SHA-256. It compares final object
inventories, detects extra/missing objects and refuses to overwrite an existing object
with different content or metadata. Existing identical objects are verified and reused,
so an interrupted run can be repeated with a **new** report path. It never deletes source
or destination objects. Reports contain only counts, a verification timestamp and an
inventory digest, without credentials, URLs, keys or customer file names. An empty report
means incomplete migration. A failure may leave verified partial copies in the destination;
keep traffic closed, investigate, and resume. Do not erase conflicting objects blindly.

Run a second verification with writers still stopped:

```bash
node scripts/deployment/migrate-object-storage.mjs \
  --source-env /protected/source.env \
  --target-env /protected/target.env \
  --verify-only --report /protected/migration-verification.json
```

Budget for multiple complete reads of both buckets. Memory is bounded by a stream and
500 listing entries, but transfer duration and disk use depend on your actual data.

SeaweedFS 4.54 may infer a MIME type from the filename when an object declares the
generic `application/octet-stream` type (for example, a `.txt` key). The verifier treats
any resulting header change as a failed migration rather than accepting it silently.
Caselog's generated storage keys contain IDs/hashes, without original filename suffixes;
customer download filenames and content types come from the database and signed response
overrides. If your dedicated bucket contains other naming conventions, resolve any
reported metadata mismatch on an isolated copy before cutover; do not skip verification.

## Switch and recover

1. Stop the original MinIO service using its original Compose configuration. Keep the
   image, volume and old backup. With the new Compose file, run `up -d --wait` without
   the temporary `S3_BIND_PORT` override. This moves SeaweedFS to the normal port and
   starts the application against `http://seaweedfs:9000`. In local development,
   `S3_ENDPOINT=http://localhost:9000` stays unchanged. Preserve signing/encryption keys,
   database credentials, public S3 origin and all database history.
2. Check API health, login, existing attachment downloads and representative checksums.
   Create and download a new attachment in a disposable workspace. Verify browser CORS
   from the configured web origin, readiness history and storage reconciliation. Only
   then reopen traffic. Do not run the destructive development seed on customer data.
3. Take and test a new format-2 backup. Old format-1 backups can only be restored using
   their original checkout/images, then migrated through S3. See [Recovery](RECOVERY.md).
   Retire old data only after the agreed retention/recovery window; this tooling never
   deletes it automatically. The obsolete stopped container may be removed separately
   without `--volumes`, after ensuring no source process is still needed.

Before allowing new writes, rollback is switching back to the retained old checkout,
configuration, MinIO image and old volume. After writes on SeaweedFS, the old volume is
stale. Stop all writers again and copy/verify the current SeaweedFS objects into a **new,
empty** MinIO bucket/volume before reverting, or restore the full pre-switch database and
object backup together and explicitly account for lost later writes. Never roll back
only the database or only the storage volume.
