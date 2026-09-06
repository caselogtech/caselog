# Recovery

This additive migration preserves all existing tokens and data. Prefer roll-forward.
Before rolling back application binaries, revoke tokens containing any new scope
using the current API. Existing tokens containing only results:write, runs:read, or
evidence:write continue working. Leave unused enum labels in PostgreSQL; removing
them requires rebuilding the enum and its dependent authentication function.
No customer records or readiness history need to be rewritten.
