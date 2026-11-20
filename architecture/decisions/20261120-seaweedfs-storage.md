# Replace bundled MinIO with SeaweedFS

- Status: Accepted
- Date: 2026-11-20
- Scope: User-approved storage replacement for development, CI and self-hosted deployment

## Context and decision

MinIO OSS is no longer maintained, including security fixes, and its repository is
archived ([upstream](https://github.com/minio/minio),
[vendor statement](https://www.min.io/pricing)). Use SeaweedFS 4.54 pinned by the same
multi-platform image digest in development and production. Use the upstream `mini`
single-process mode with persistent `/data`, including its LevelDB filer metadata.
This is a single-host baseline, without an availability or capacity guarantee.

Keep AWS S3 SDK, the `StorageProvider` contract, signed upload/download URLs, checksum
validation, object keys and application/database contracts. Do not introduce a local
filesystem adapter, proprietary service, new product capability or licensing dependency.
Only the authenticated S3 endpoint is published, on loopback. Disable unused WebDAV,
Iceberg, Lance, IAM and admin UI surfaces and upstream telemetry. Restrict browser CORS
to the configured application origin. Internal control ports stay on the private network.

## Compatibility and recovery

Use a new `seaweedfs-data` volume; never mount legacy MinIO volumes into SeaweedFS.
Stop all writers and direct uploads during migration. The operator tool streams current
S3 objects, copies their keys and metadata, verifies actual SHA-256 bytes and matching
inventories, and refuses to overwrite different objects. Retries reuse matching copies.
The source is never mutated. Retain source images, volumes, checkout, secrets and backup.
No database migration or rewriting of historical attachment references is needed.

Backup manifest format 2 names SeaweedFS images and physical data. New restore tooling
rejects MinIO format 1 with instructions to restore using its original source checkout
and migrate through S3. Rollback before reopening writes restores the old configuration
and MinIO image/volume. After new writes, copy and verify those objects back through S3
or recover the complete pre-switch snapshot, explicitly accepting lost later writes.
See [the operator runbook](../../deploy/STORAGE-MIGRATION.md).

## Verification

Verify signed URLs, checksum rejection, metadata/copy/read, pagination/delete, CORS and
anonymous denial against real SeaweedFS; run attachment and tenant-isolation suites.
Exercise migration, replay, conflicts and extra/missing objects, and retain a local
migration report without secrets or object names. Run the Docker clean-install and
backup/restore drill with browser HTTPS uploads and exact image checks. This does not
establish HA, cross-architecture recovery, large-data migration time or pilot capacity.

Upstream references: [release 4.54](https://github.com/seaweedfs/seaweedfs/releases/tag/4.54),
[mini implementation](https://github.com/seaweedfs/seaweedfs/blob/4.54/weed/command/mini.go),
[persistent filer configuration](https://github.com/seaweedfs/seaweedfs/blob/4.54/docker/filer.toml).
