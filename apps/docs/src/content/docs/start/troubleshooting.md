---
title: Troubleshooting
description: Diagnose onboarding, permissions, uploads, and stale readiness.
sidebar:
  order: 3
---

## Registration or email verification

Public signup is controlled by the operator. Invitation-only mode requires an invitation
from an existing workspace. If mail is missing, check spam and request a resend. An
operator should verify SMTP host, port, TLS mode, credentials, and delivery logs. Do not
paste credentials, password-reset URLs, or verification tokens into public issues.

## Forbidden or missing resources

Confirm the current workspace, project, and membership role. Resources in another
workspace deliberately behave as unavailable; knowing an ID is not authorization.
Ask the workspace owner to review membership. A billing-account or staff role does
not grant implicit access to customer workspaces.

## Browser upload fails

The browser must reach the public HTTPS storage origin. Operators should check DNS,
TLS, CORS, and preservation of the signed `Host` header at the storage proxy. The API's
internal MinIO URL is not a suitable browser URL. See [deployment topology](../../reference/installation/).
Do not share presigned URLs: they contain temporary access credentials.

## Readiness stays pending, stale, or unknown

First inspect the candidate's gate diagnostics and linked runs. Check for incomplete
runs, missing producers, untrusted observations, or evidence that has expired. Submit
new evidence for the same exact candidate where appropriate and request evaluation.

Operators should inspect job failures, queue health, and database connectivity using
the [operations commands](../../reference/installation/#operation-and-diagnostics).
An old ready decision must not be treated as current while processing is failing.

## An update fails

Keep the affected installation's traffic restricted and inspect migration status and
service health. Follow the [recovery runbook](../../reference/recovery/). Replacing the
application image alone does not reverse database changes. Do not reset the database,
delete volumes, or edit migration history as a troubleshooting shortcut.

For a report, include the product version, source revision, relevant safe error code,
expected behavior, and reproduction steps. Use the [private security channel](../../reference/security/)
for vulnerabilities.
