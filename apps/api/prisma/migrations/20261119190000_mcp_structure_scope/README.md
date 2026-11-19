# MCP structure scope

Apply this additive migration before deploying binaries that issue `structure:write`
tokens. Existing tokens retain their scopes; no backfill or table rewrite is needed.
The same migration runs on empty and existing installations.

For recovery, revoke tokens carrying `structure:write` using the newer application
before rolling back to older binaries. Keep the unused enum label; removing it would
require rewriting dependent token data. Structure creation without an idempotency
header remains available to existing browser sessions.
