# Recovery

Apply this additive migration before deploying the MCP-aware application. No backfill
or rewrite of existing tokens is required. Existing scopes retain their permissions.
Before rolling back application binaries, revoke tokens containing projects:read,
cases:read, cases:write, policies:read, policies:write or policies:publish using the
current application. Leave unused enum labels in PostgreSQL; removing labels requires
rebuilding dependent enum columns/functions. Prefer roll-forward. Test both fresh
installation and upgrade with existing records. See the MCP architecture decision.
