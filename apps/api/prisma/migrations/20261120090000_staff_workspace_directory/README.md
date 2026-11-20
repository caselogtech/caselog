# Staff workspace directory

Apply before deploying the new application artifacts. This adds two bounded, read-only
staff projections with explicit admin checks, an empty search path and no PUBLIC
execution privileges. No tenant table, record, RLS policy or existing function changes.
The migration works on both empty and existing installations; no backfill is needed.

Older binaries continue using their original functions. To recover, roll back the
application artifacts and leave the unused functions in place. Remove them only after
all consumers have been rolled back. No customer data needs restoration for this change.
