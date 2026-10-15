# Release candidate integration pass

## Rollback

Rolling code back to an earlier release changes which code serves requests. It does not undo schema changes, and it never deletes or rewrites payments, receipts, refunds, deposits, audit events or message history. Every migration in this repo is additive so an older release can still read the database. A data correction is a separate, reviewed and authorized operation with its own backup reference, never a side effect of redeploying older code.
