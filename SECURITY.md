# Security policy

## Report a vulnerability privately

Email **ivan.pelykh@protonmail.com**. Do not open a public issue containing vulnerability
exploitation details, credentials, signed object URLs or customer data.

Include the affected commit or release, deployment mode, relevant configuration without
secrets, reproduction steps, expected and observed behavior, and the impact you can
verify. Use a disposable local tenant and synthetic evidence. Stop if testing would
access another person's data or disrupt a system you do not administer.

The maintainer will review the report and coordinate a fix and disclosure with you.
Handling is best effort; there is no guaranteed response time, paid bounty or support
SLA. If you receive no reply, follow up using the same address. Public disclosure should
include affected versions, remediation and safe reproduction details after coordination.

## Supported versions and updates

Caselog is pre-1.0 and does not yet maintain a stable release or backport series. Security
fixes target the current development line. Deploy an exact reviewed commit and follow
its migration/recovery notes; do not assume an old commit receives backports. Future
release support windows must be published explicitly before they are promised.

Use the [self-hosting guide](deploy/README.md) and [recovery runbook](deploy/RECOVERY.md).
Keep migration credentials separate from runtime credentials, preserve tenant RLS,
restrict forwarded-header trust to the actual proxy chain, and keep database/S3 admin
ports private. Backups contain credentials and customer evidence and need separate access
control and encryption. A self-hosted operator controls their infrastructure and updates.
