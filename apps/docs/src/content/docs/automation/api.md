---
title: API and CI access
description: Use generated API contracts, scoped tokens, and the CLI.
---

The API is a first-class product surface. A running installation serves interactive
OpenAPI documentation at `/api/v1/docs` and JSON at `/api/v1/openapi.json`.
The documentation site also includes a [downloadable OpenAPI contract](../../downloads/openapi.json)
from this checkout; compare its version with the installation you are calling.

## Authentication and workspace scope

Browser sessions and organization-scoped CI tokens serve different workflows. Create
a token in workspace settings under API tokens. Give it only the scopes needed by its
pipeline, and store it in your CI secret manager. Tokens remain subject to the creator's
current workspace membership and role; a scope alone does not grant tenant access.

| Scope | Intended CI operation |
| --- | --- |
| `results:write` | Upload automated test results. |
| `evidence:write` | Submit external observations. |
| `candidates:write` | Create candidates, look them up, and link runs. |
| `readiness:read` | Read assigned policy and readiness decisions. |
| `readiness:write` | Assign a published policy and request evaluation. |

Closing a CI run requires both `candidates:write` and `results:write`. Policy authoring,
waivers, destructive unlinking, and token administration remain session-only workflows.

## Start with the CLI

Build the CLI from the repository, set `CASELOG_API_URL` to your installation's
`https://…/api/v1` URL, and provide `CASELOG_TOKEN` through the environment. Follow the
[CLI reference](../../reference/cli/) for a complete candidate-to-evaluation pipeline
and the [CI examples](../../reference/ci-examples/) for workflow fragments.

Require success from every step. An ingestion failure must not be hidden by a later
successful query. Pipeline commands and the older `upload` command have different
documented exit contracts; consult the reference before interpreting an exit number.

## Retries and errors

Use stable idempotency keys for retryable writes. Preserve the same key and payload
when retrying an uncertain response; changing the request with the same key is a conflict.
API errors include machine-readable codes and request identifiers. Report those safe
identifiers when diagnosing failures, without publishing tokens or sensitive evidence.

Product version `0.1.0`, REST prefix `/api/v1`, and CLI JSON envelope version `1` are
independent identifiers. A patch release does not rename the API namespace.
