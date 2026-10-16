# Release candidate integration pass

Local, isolated work only. Nothing here was pushed, deployed, migrated on a shared database, or tried against a live provider. Passing local tests are evidence for review, not a launch decision.

- Branch: `cursor/rc-integration-10f0`
- Base: `dd5c23fe50f23c391a0b953d3f5eb1b9489c7211`
- Combined diff: `git diff dd5c23fe50f23c391a0b953d3f5eb1b9489c7211..cursor/rc-integration-10f0`

## Reconciliation

"Fixed and integrated" means a server-side rule, an application caller that goes through it, and a test that drives the caller. A library with passing tests and no caller is not counted as integrated.

| Area | Item | Status | Where |
|---|---|---|---|
| Release control | Sweeps need a listed target serving the approved release; remote migration takes its target only from the environment, applies only reviewed plan files and records release, target, checksum, approval and backup; prod-verify compares the expected commit | Fixed and integrated | ba261a7 |
| Caller promises | Network pass needs this call's disclosed offer and the caller's own later yes, kept as evidence; the handoff shares only what was disclosed | Fixed and integrated | 8a66cc2 |
| Caller promises | A hold needs a time this call was offered, still unexpired | Fixed and integrated | 8a66cc2 |
| Caller promises | Safety alert copy says queued, never texted; the safety instruction stands if the alert fails | Fixed and integrated | 8a66cc2 |
| Activation | Turning a shop on records the notice, permissions, terms version, actor and time; a missing or stale approval is refused before checkout; bound to the paid checkout | Fixed and integrated for the sandbox turn-on path | 7620f4b |
| Activation | The non-sandbox onboarding wizard records terms and SMS consent but no recording acknowledgement | Partially fixed | `onboarding-wizard.tsx` |
| Demo lifecycle | Open and reset share one per-person lease; one canonical demo per person; only that person's demo shops are ever deleted | Fixed and integrated | 6178f3f, 9c4e998 |
| Scheduling | One owner clash check on every owner channel, now including the assigned technician's skill and field-software busy time | Fixed and integrated | 1c1ac71 |
| Scheduling | Travel policy | Already in place before this pass | `scheduling-policy.ts` |
| Scheduling | Connected field software with no first successful read is unknown, not free | Fixed and integrated | 68223f1 |
| Scheduling | Job transitions centralized | Already in place before this pass | `job-transition.ts` |
| Scheduling | A bare DONE that could mean two jobs asks which and changes nothing | Fixed and integrated | 1c1ac71 |
| Scheduling | Technician day load uses the shop's calendar date | Fixed and integrated | 1c1ac71 |
| Bills | A payment on an already settled bill or deposit is held as an owner exception, never refunded automatically | Fixed and integrated (invoice and deposit webhook and redirect paths) | 6c08b33 |
| Bills | A bill the customer was sent, signed or paid toward keeps its amount; changing it needs an owner or manager and a reason; the route returns 409, technician collect and auto-invoice stop | Fixed and integrated | 6c08b33, c8f6508 |
| Bills | One active deposit per booking under concurrency | Fixed and integrated | 6c08b33 |
| Bills | A refunded payment stays on the record and the customer's bill says what was refunded | Fixed and integrated (public invoice) | 6c08b33 |
| Bills | Canonical receivables ledger wired into issuance, completion, collection, webhook, redirect, refund and public view | Still open. `receivable-ledger.ts` and `prisma/prepared/receivables-v1.sql` exist with tests but have no application caller; the guards above are enforced on the existing Invoice and Deposit records instead | — |
| Bills | Manual, unlinked and recurring records | Unchanged and still pass their suites | — |
| Authority | Command plans: claimed before any effect; a failure after an effect is held for a person and never re-run; withdraw against execute is atomic | Already in place; verified | `copilot-execute.ts` |
| Authority | A plan more than 12 hours old, or a follow-up text to a lead already booked or lost, is refused before any effect and says nothing changed | Fixed and integrated | c8f6508 |
| Authority | Being a member does not grant money power: `money.adjust` (owner, manager) is needed to change a committed bill, accept or reject an "I paid", or edit the price book | Fixed and integrated | c8f6508 |
| Authority | Integration and team-admin routes already need `settings.edit` or `team.manage` | Already in place; verified | route audit |
| Delivery | A carrier "failed" after "delivered" no longer reopens or resends the owner alert, flips the intent ledger, or reports a failed customer confirmation | Fixed and integrated | faa0e35 |
| Delivery | Email the mail service accepted is recorded as accepted, never delivered; test alert copy says sent | Fixed and integrated | faa0e35 |
| Delivery | Open reconciliation exceptions are visible on Command, linked to the job, and resolving one records what was done | Fixed and integrated | 03385a6 |
| Delivery | Severe SMS lost replies are unknown, never retried blind, one exception each | Already in place; verified | `sms-intent.ts` |
| Delivery | Lost replies from Stripe and the voice provider become exceptions | Partially fixed (Stripe idempotency keys and checkout reservation exist; no exception row for a lost Stripe reply) | — |
| Delivery | Record authority per workflow | Partially fixed (contract and API exist; Jobber, Housecall Pro and QuickBooks syncs don't consult it) | `system-of-record.ts` |
| Delivery | Proof loop wired into real records | Still open (`proofLoopMetrics` has no caller) | — |
| Delivery | Modeled vs reported costs | Still open (`overageEconomicsReport` has no caller); the $0.50 rate and allowances are unchanged | — |
| Delivery | Scheduler | No new scheduler; `alert-drain.yml` and `sweep-heartbeat.yml` are unchanged | — |
| Recovery | A failed check for an existing shop is unknown with Try again, never the new-shop payment form | Fixed and integrated | 6c49bcc |
| Recovery | Signed-out Calls, Jobs, Schedule, Team and Customers pages offer Sign in back to the same page; other failures keep Retry | Fixed and integrated | fdacc46 |
| Recovery | A failed customer list is not "No customers yet" | Fixed and integrated | fdacc46 |
| Recovery | Settings traps Tab and restores the trigger | Fixed and integrated | fdacc46 |
| Recovery | Open trades named at sign-up with the interest list | Fixed and integrated | fdacc46 |
| Recovery | Annual pricing says the allowance and 50¢ overage stay monthly | Fixed and integrated | fdacc46 |
| Legal | Copy drafts for review | Prepared for review only, not published | `docs/legal-review/DRAFT-consent-and-billing-copy.md` |

## Behavior changes an owner should review

- Dispatchers can no longer accept or reject a customer's "I paid", change a bill the customer already has, or edit the price book. They can still bill a job and log cash in hand. This is a code-level role rule; no stored grant was migrated.
- A second card payment on a settled bill is no longer refunded automatically. It waits on the owner under "Money and records to check".
- A Command plan older than 12 hours must be asked for again.

## Schema and migrations

All additive. Applied only to disposable local SQLite databases in this pass.

| File | sha256 |
|---|---|
| `prisma/schema.prisma` | `d5ff386cc1d9f55fdf845e04d731e084bb33b38b755169927ad161afc9eead43` |
| `prisma/turso-migrate.sql` (full file) | `e58ae086ffba204eafbef807fa5c580c1992f53d13b181cb8fe67b58a304261f` |
| `prisma/turso-migrate.sql` lines added in this pass (28 lines: `Call` offer and consent columns, `NetworkHandoff.sharesJson`, `ActivationAcknowledgement`) | `ee9ef883b5d238c494d4ff557e5ff7f2c2f5569753a4c4b41c9a37fa9d8de222` |
| `prisma/prepared/receivables-v1.sql` (prepared, not executed, header comment only changed) | `26979e36ee67697b5b4bf49ed6be1548c7347d2fbe263b5e53b9633327d8dd86` |

The base `turso-migrate.sql` at `dd5c23f` hashed `20f8abf8adb7a69972413c0905dcd434ace14ca1303961b7443b9144004202b7`.

## Validation

See the summary handed over with this branch for the exact counts from the clean-checkout run (no `.env`, disposable database, no provider credentials).

## Separately authorized live verification still needed

1. Apply the 28 added migration lines to a staging copy of the production database, with backup, and confirm older code still reads it.
2. One real inbound call per launch trade on a staging line: network offer, consent and handoff; a hold on an offered time; a safety call with the alert queued.
3. Turn on a test shop through real Stripe test-mode checkout and confirm the activation acknowledgement binds to the session.
4. A Stripe test-mode double payment on a settled invoice and on a deposit: confirm no refund is issued, the exception appears on Command, and the owner alert arrives.
5. Twilio status callbacks in real order and out of order (delivered then failed) against a staging number.
6. Email delivery to a real inbox, to confirm accepted vs received.
7. A connected Jobber, Housecall Pro or ServiceTitan sandbox with no first read: confirm booking is held, not free.
8. A dispatcher account on a staging shop: confirm the new money limits read correctly in the UI.
9. Legal review of the copy drafts before anything is published.

## Rollback

Rolling code back to an earlier release changes which code serves requests. It does not undo schema changes, and it never deletes or rewrites payments, receipts, refunds, deposits, audit events or message history. Every migration in this repo is additive so an older release can still read the database. A data correction is a separate, reviewed and authorized operation with its own backup reference, never a side effect of redeploying older code.
