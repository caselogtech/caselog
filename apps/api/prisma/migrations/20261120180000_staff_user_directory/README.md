# Staff user directory

Apply before the new binaries. This adds two bounded, read-only, admin-guarded
projections with an empty search path and restricted execution privileges. No table,
existing function, RLS policy or tenant data changes; no backfill is necessary.

For recovery, roll back application artifacts and leave the unused functions in place.
Older artifacts continue working. Both empty and existing databases must be verified.
