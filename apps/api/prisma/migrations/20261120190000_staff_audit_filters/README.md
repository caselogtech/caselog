# Staff audit filters

Apply before the new artifacts. This adds an owner-only read projection; no existing
function, table, audit record, RLS policy or append-only protection changes. No backfill
is required. Test both an existing database and an empty disposable database.

Recover by rolling back application artifacts while leaving the unused function in
place. Older binaries continue using the original projection without filters.
