# Release candidate integration pass

Local, isolated work only. Nothing here was pushed, deployed, migrated on a shared database, or tried against a live provider. Passing local tests are evidence for review, not a launch decision.

- Branch: `cursor/rc-integration-10f0`
- Base: `dd5c23fe50f23c391a0b953d3f5eb1b9489c7211`, itself 46 unpublished commits ahead of `origin/main` at `39b17d7`. Review both ranges: `39b17d7..HEAD` (everything not yet on the remote) and `dd5c23f..HEAD` (this integration pass).
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
| Activation | Every path that turns a line on settles the approval server-side before anything is bought: new-shop checkout (409 without a current claim), webhook and browser build after payment (a renamed shop needs a fresh claim), test-shop promotion (foreign, other-actor, other-checkout or stale records refused), staff-created shops (written operator record: owner email, method, reference, operator) and line repair (refused for test shops). Actor, actor kind, notice and setup versions and time are stored with the shop in one transaction | Fixed and integrated | f6599b6 (`activation-ack.ts`, `provision-business.ts`, `checkout-shop.ts`, `billing/checkout`, `onboarding`, `businesses`; `scripts/activation-paths.test.mjs`) |
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
| Bills | One financial source of truth | Decided: Invoice, Payment and Deposit stay authoritative. `receivable-ledger.ts` and `prisma/prepared/receivables-v1.sql` are marked non-authoritative; a test fails if anything in `src` imports them or the schema gains their tables. The live paths are shown to hold the ledger's invariants through their real callers: concurrent issuance makes one bill, a sent bill is held without a reason, a paid bill is never rewritten, a deposit is subtracted and never edited, concurrent deposits make one, late and duplicate payments are held, refunds touch only their payment, manual and unlinked bills follow the same balance rules | Fixed and integrated (option B) | e66cb1e (`scripts/money-invariants.test.mjs`) |
| Authority | Command plans: claimed before any effect; a failure after an effect is held for a person and never re-run; withdraw against execute is atomic | Already in place; verified | `copilot-execute.ts` |
| Authority | A plan more than 12 hours old, or a follow-up text to a lead already booked or lost, is refused before any effect and says nothing changed | Fixed and integrated | c8f6508 |
| Authority | Money power is a scoped owner grant, not a role: only the owner holds `money.adjust`; anyone else needs a `FinancialGrant` for one scope (`confirm_payment`, `revise_bill`, `price_book`, `resolve_payment`), still a teammate, unexpired (90 days at most), unrevoked, under the current policy version and within its amount cap. Checked when the action runs; use is logged with the grant id. Owner-only `/api/money-grants` issues, lists and revokes; Settings → Team → Money rights is the owner's screen for it (hidden from anyone the API refuses; a failed issue keeps the form) | Fixed and integrated | 7bfef23, 22e1754 (`money-authority.ts`, `money-grants-group.tsx`; `scripts/money-authority.test.mjs`) |
| Authority | An owner running a high-impact plan they asked for themselves is recorded and shown as "owner confirmed their own request", never as an independent approval; anyone else can't approve their own high-impact plan | Already in place; verified through the execute path | `command-authority.ts`, `copilot-execute.ts`; `scripts/command-authority.test.mjs` |
| Authority | Command plans inside the 12-hour window are rechecked at execution: lead booked or lost, technician inactive or busy, approver's grant revoked, proposer removed from the team, job closed, window gone | Fixed and integrated | bc10a2e (`scripts/command-stale.test.mjs`) |
| Authority | Integration and team-admin routes already need `settings.edit` or `team.manage` | Already in place; verified | route audit |
| Delivery | A carrier "failed" after "delivered" no longer reopens or resends the owner alert, flips the intent ledger, or reports a failed customer confirmation | Fixed and integrated | faa0e35 |
| Delivery | Email the mail service accepted is recorded as accepted, never delivered; test alert copy says sent | Fixed and integrated | faa0e35 |
| Delivery | Open reconciliation exceptions are visible on Command, linked to the job, and resolving one records what was done | Fixed and integrated | 03385a6 |
| Delivery | Severe SMS lost replies are unknown, never retried blind, one exception each | Already in place; verified | `sms-intent.ts` |
| Delivery | Uncertain Stripe and Vapi effects: each is recorded (provider, operation, correlation key, idempotency key, entity) before the call. A lost reply leaves it `uncertain` with a Command exception; a retry inside Stripe's idempotency window replays the same key, after it the effect is found by its tag or refused, never re-created blind. A local save failure after the provider accepted leaves it `accepted` and the retry finishes from the provider's record. Covered: invoice, estimate and deposit checkouts, Connect account creation, receptionist creation during provisioning. Admin stuck-effects list at `/api/admin/provider-effects` | Fixed and integrated for those callers | 3b8c537 (`provider-effect.ts`; `scripts/provider-effects.test.mjs`) |
| Delivery | Money-back refunds and plan cancel, overage invoice item and invoice, plan pause and resume, and the staff-created shop's receptionist are on the effect record. A lost reply is `uncertain` with an exception; the retry looks the effect up at the provider first (a refund by its charge and tag, an overage invoice by its month, a resume by the subscription's pause state, a staff receptionist by its slug tag) and lands it, closing the exception. A resume inside a pause can't start two paid months. The plan checkout serializes per email and opens no session while an earlier one can't be closed | Fixed and integrated | efea5e1, 1354c5c, 4fa8eee (`money-back-claim.ts`, `overage-billing.ts`, `plan-pause.ts`, `businesses/route.ts`, `billing/checkout`; `scripts/money-back.test.mjs`, `scripts/stripe-effects.test.mjs`, `scripts/keep-customers.test.mjs`, `scripts/activation-paths.test.mjs`) |
| Delivery | Subscription metadata writes (`linkPaidCheckoutToBusiness`, checkout return, webhook) | Not on the effect record by choice: each sets the same values on every run, so repeating one after a lost reply changes nothing | `billing-sync.ts`, `billing/webhook` |
| Texting | Customer and technician texts need the shop's approved campaign or a verified shared sender. The shared sender counts as verified only when the founder launch check reads a toll-free verification of TWILIO_APPROVED for the exact number in use; a Messaging Service sender can't be verified that way and stays held. Held texts write an audit row and a "held, not sent" reason and are never re-routed to email; an own-campaign refusal doesn't fall back to an unverified sender. Follow-up, review and plan-reminder sweeps skip held shops. A local (10DLC) number is not launch-ready | Fixed and integrated; sender approval needs external verification | 38a17f2, 93a1267 (`sms-eligibility.ts`, `twilio-sms.ts`, `customer-sms.ts`; `scripts/sms-eligibility.test.mjs`) |
| Activation | Voice, texting, booking, follow-ups and payments are each reported as on, waiting or off from their own prerequisites (go-live approval on record and not a test shop; verified sender; open hours, a travel policy and a readable schedule; auto follow-ups with texting on; a Connect account with charges enabled), next to what the owner asked for, with a fix link. Tests show the report agrees with the call tools, the booking page, the follow-up sweep and the deposit gate | Fixed and integrated | 93a1267, 22e1754 (`capabilities.ts`, `/api/capabilities`, Settings → Receptionist; `scripts/capabilities.test.mjs`) |
| Delivery | Record authority in the real callers: Jobber and Housecall Pro job sends, QuickBooks receipts and field-software schedule reads read the contract at send time; owner-listed copies (`replicas`) are kept; a shop with no contract keeps what it connected; a refusal is a visible skipped row with the reason; lost replies raise a Command exception; successful sends are correlated | Fixed and integrated | 9c1e565 (`record-authority.ts`; `scripts/record-authority.test.mjs`) |
| Delivery | Proof loop and economics reporting | Fixed and integrated: owner Reports panel and `/api/reports/proof` (observed loops, team-entered work, modelled costs, missing data, no causal claim); internal `/api/admin/economics` (costs with sources; revenue and margin reported missing because Stripe invoices aren't mirrored). Read-only; prices and allowances unchanged | 4fbf749 (`proof-report.ts`; `scripts/proof-report.test.mjs`) |
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
- Managers lose those same money actions unless the owner issues a scoped money grant from Settings → Team → Money rights. On release a manager who did these today is refused until the owner grants it. No real tenant's grants were created or migrated.
- **Customer and technician texts stop** for every shop until its own campaign is approved or the shared sender is verified by the founder launch check (toll-free, TWILIO_APPROVED, for the number in use). Held texts are recorded, not sent, and not switched to email. Owner alerts still go out on the shared sender: whether they should also wait is an owner decision.
- A local (10DLC) shared number no longer passes the launch check.
- A test shop can't open its go-live checkout until hours and permissions are saved.
- A money-back claim or plan resume whose Stripe reply was lost now stops with "may have happened, flagged" instead of a generic retry message, and the retry checks Stripe first.
- Payment-mismatch exceptions on Command can be resolved only by the owner or a `resolve_payment` grant holder; other exceptions stay owner or manager.
- Jobber, Housecall Pro and QuickBooks stop receiving a part of the record once the owner saves a contract that names another system as its record of truth and doesn't list them as a copy. Shops without a contract are unchanged.
- With two field-software tools connected, schedule reads follow the contract's availability owner instead of the fixed ServiceTitan, Housecall Pro, Jobber order.
- `mark_contacted` plans on a lead that is booked, lost or spam are refused, and a plan asked for by someone since removed from the team doesn't run.
- Staff-created shops need a written operator activation record; line repair refuses test shops.
- A second card payment on a settled bill is no longer refunded automatically. It waits on the owner under "Money and records to check".
- A Command plan older than 12 hours must be asked for again.

## Notes on specific choices

**Why a 12-hour Command limit isn't the eligibility check.** The limit only bounds how old the picture shown to the approver may be. Eligibility is read again when the plan runs: the approver's current role and grants (`decideApproval` with fresh grant rows), whether the proposer is still on the team, and the target's current state (lead status, technician active and free, job open, window still open). `scripts/command-stale.test.mjs` makes one-hour-old plans stale in each of those ways and checks each is refused with nothing changed and the plan left for a fresh decision.

**Tool-speed test.** The earlier assertion (`updatedAt` unchanged on the caller's wait) forbade a write the hold check depends on: a hold is only accepted for a time this call was offered, so the offer must be stored. What the original test protected against was extra writes, upserts and transactions on the caller's wait. The suite now enforces that directly: with an existing call row, an availability reply makes exactly one write when it offers times (two at most when it offers the network), only `Call.updateMany` by id, only the offer fields, no transaction. A 200 ms delay injected into that write raises the reply time by about one write, and a failing write returns the safe "don't offer a time" answer with status 200.

## Self-service setup journey: what is integrated and what isn't

Integrated (ea342de; `setup-flow.ts`, `setup-sandbox.ts`, `/api/setup`, `/api/setup/draft`, `turn-on-orvius.tsx`, `onboarding-wizard.tsx`, `billing/checkout`; `scripts/setup-progress.test.mjs`):
- **Progress.** Each step is stamped in `setupJson.done` when saved. Saving or opening a step whose prerequisites aren't saved is refused with what to finish first (permissions need hours; the test and going live need hours and permissions). Going back is allowed. Shops from before this keep the progress their saved fields imply.
- **Resume.** The resume point is the saved step, clamped to what is allowed. The go-live screen's owner phone and area code are kept on the server. The production sign-up form is kept per signed-in email (`SetupDraft`), restored on another device, and deleted once the shop is built.
- **Facts.** The setup view lists each business fact as confirmed, imported (keeps its source), a starting value or unknown. Permissions are never chosen for the owner.
- **Failures.** A failed test call is kept with its attempt count and an actionable message (no internal error text). Uncertain or failed provider effects for the shop are shown on the setup screen.
- **Going live.** The checkout that turns a test shop on returns 409 `setup_incomplete` before any approval record or Stripe session when hours or permissions aren't saved.
- **Capabilities.** The setup screen shows what will actually run once live, from the same report as Settings.

Not done: a line purchase that fails after payment is still retried by the owner pressing the button again (the provider effect prevents a duplicate receptionist or number). The questions asked were not re-audited for whether each changes behavior.

## Schema and migrations

All additive. Applied only to disposable local SQLite databases in this pass.

| File | sha256 |
|---|---|
| `prisma/schema.prisma` | `65ccd2b10123d93a67ae7d20723bc7efe7675e0b17c4220ae1fb22b0c378954c` |
| `prisma/turso-migrate.sql` (full file) | `d21dbab126ffd7efd15433d3316f5568a7af09c7f6e4848905ff7e4ce9e5910b` |
| `prisma/turso-migrate.sql` lines added since `dd5c23f` (82 lines, none removed: `Call` offer and consent columns, `NetworkHandoff.sharesJson`, `ActivationAcknowledgement` with actor kind and attestation, `ShopRecordContract.replicasJson`, `ProviderEffect`, `FinancialGrant`, `MessagingSender`, `SetupDraft`), extracted with `git diff dd5c23f -- prisma/turso-migrate.sql \| grep -E "^\+[^+]" \| sed 's/^+//'` | `87c7217602ebd159d6f29448e7cc234df1a4467198aeb069c2353cc30434e45a` |
| `prisma/prepared/receivables-v1.sql` (prepared, not executed, header comment only changed) | `26979e36ee67697b5b4bf49ed6be1548c7347d2fbe263b5e53b9633327d8dd86` |

The base `turso-migrate.sql` at `dd5c23f` hashed `20f8abf8adb7a69972413c0905dcd434ace14ca1303961b7443b9144004202b7`.

## Validation

Clean copy of commit `8ed1794bbe4c740d13d2b667c8309b82e4f03b9d` (tracked sources only, no `.env` present, asserted before each step), a disposable local SQLite database, no provider credentials, providers mocked.

- `prisma db push` to the disposable database: ok
- `tsc --noEmit`: exit 0
- `npm run test:trust`: 1601 tests, 1601 pass, 0 fail (new since the last record: `sms-eligibility`, `capabilities`, `setup-progress`, `stripe-effects`; extended: `money-back`, `keep-customers`, `activation-paths`, `sms-intent`, `launch-gate`, `activation-ack`)
- `npm run build`: exit 0
- `eslint --quiet src`: no errors (the `jobs/page.tsx` warning predates this pass)
- `git diff --check 39b17d7..HEAD`: clean

The commit after `8ed1794` changes only this file.

Disclosure: early in this pass one `prisma db push` ran from the main checkout after a failed copy step, so the Prisma CLI may have read that checkout's `.env` into its own process. Its target was the disposable `file:/tmp/clean.db`, nothing was printed, and no provider was called. Every later step ran in the clean copy.

These are isolated results. They do not show production delivery, provider behaviour or launch readiness.

## Separately authorized live verification still needed

1. Apply the 64 added migration lines to a staging copy of the production database, with backup, and confirm older code still reads it.
2. One real inbound call per launch trade on a staging line: network offer, consent and handoff; a hold on an offered time; a safety call with the alert queued.
3. Turn on a test shop through real Stripe test-mode checkout and confirm the activation acknowledgement binds to the session.
4. A Stripe test-mode double payment on a settled invoice and on a deposit: confirm no refund is issued, the exception appears on Command, and the owner alert arrives.
5. Twilio status callbacks in real order and out of order (delivered then failed) against a staging number.
6. Email delivery to a real inbox, to confirm accepted vs received.
7. A connected Jobber, Housecall Pro or ServiceTitan sandbox with no first read: confirm booking is held, not free.
8. A dispatcher account on a staging shop: confirm the new money limits read correctly in the UI.
9. Legal review of the copy drafts before anything is published.
10. Stripe test mode with the network cut after the request is sent: confirm the effect shows as uncertain on Command and the retry replays rather than creating a second session or Connect account.
11. A Jobber and Housecall Pro sandbox connected to one staging shop, with a saved contract: confirm only the record of truth and listed copies receive the job.
12. A manager account on a staging shop with and without a money grant, issued and revoked from Settings → Team → Money rights.
13. Apply the `MessagingSender` and `SetupDraft` tables (part of the 82 added lines) with the same staging procedure as item 1.
14. Run the founder launch check against the real toll-free sender in Twilio's console view (read-only) to confirm a TWILIO_APPROVED verification is recorded for the exact number in use; until then customer texts stay held. Decide whether a Messaging Service sender needs its own verification path. No registration submission is part of this.
15. Stripe test mode: a money-back claim, an overage invoice and a resume inside a pause with the network cut after the request; confirm each shows as uncertain, the retry checks Stripe and nothing is refunded, invoiced or started twice.
16. A staff-created shop on staging with the Vapi reply dropped; confirm the retry reuses the tagged receptionist.
17. Open setup on one device, close the tab, continue on another signed in as the same email; confirm the step, the go-live typing and the sign-up form come back, and the go-live checkout refuses until hours and permissions are saved.

## Rollback

Rolling code back to an earlier release changes which code serves requests. It does not undo schema changes, and it never deletes or rewrites payments, receipts, refunds, deposits, audit events or message history. Every migration in this repo is additive so an older release can still read the database. A data correction is a separate, reviewed and authorized operation with its own backup reference, never a side effect of redeploying older code.

## Production release of `cursor/merge-all-10f0`

Migration first, then the push. Nothing below has been run against production.

### The migration

`prisma/releases/2026-10-16-merge-all.sql`, sha256 `9da90192fbe9246ede1bd13a3d2c58eb0969fe691b30ce1a758295e6cb1a99e5`. It is the output of `prisma migrate diff` from the `schema.prisma` on main at `39b17d77ffaf595dbc71c070ca68fdb351344be4` to this branch, with every CREATE made IF NOT EXISTS. It has 36 statements: 9 nullable TEXT columns on `Call`, `CopilotAction` and `NetworkHandoff`, 11 new tables and 16 indexes. Nothing is dropped, rebuilt, backfilled or read. The full historical `turso-migrate.sql` is not run, and `receivables-v1.sql` is not part of this release (no app code uses it).

### Rehearsal (disposable SQLite files only)

| Check | Result |
|---|---|
| Main's suite on main's schema (baseline, and the synthetic data) | 1332/1332 |
| Pre-migration backup and restore drill with `db-backup.mjs` | 57 tables, 1063 rows, every count matches |
| First apply through `applyMigrationPlan` | applied, ledger row 1 |
| Every pre-existing row and value after the apply | all 1063 identical; new columns NULL |
| Second apply | no error; schema and data unchanged apart from ledger row 2 |
| `prisma migrate diff` migrated file to the branch schema | only the runner's ledger table, which is not a Prisma model |
| `release-schema-check before` on the restored backup, `after` on the migrated file | MATCH, MATCH |
| Main's suite on the migrated database | 1332/1332 |
| Branch suite on the migrated database, no `db push` | 1616/1616 |
| Main's suite again, over rows the new code wrote (12 SmsIntent, 145 ProviderEffect, ...) | 1332/1332 |
| Main's Prisma client reading and updating rows with all 9 new columns filled | reads all rows, update keeps the new value |

### Not tested

- Production's schema was not read. Last night's backup reported 58 tables; main's schema has 57 models. `release-schema-check before` stops the release if the difference is anything except the migration ledger.
- The rehearsal used Prisma's SQLite engine on files. Production goes through the libsql adapter to Turso.
- The Turso copy and point-in-time steps below have not been run from this environment.

### Sequence

1. `git fetch origin main`. Stop if main is not `39b17d77ffaf595dbc71c070ca68fdb351344be4`.
2. Add the production host (no credentials) to `production` in `ops/migration-targets.json` and commit. That commit is the release commit `R`.
3. Backup: create a Turso copy of the production database (`turso db create <name> --from-db <prod>`), confirm it exists, that `release-schema-check before` matches on it, and that its per-table row counts equal production's. Record the UTC time as the point-in-time fallback. The nightly encrypted backup (last run green) is the second copy.
4. Pre-flight on production: `node scripts/release-schema-check.mjs before prisma/releases/2026-10-16-merge-all.sql`. Stop unless it matches.
5. Apply: `MIGRATION_APPROVAL=<ref> MIGRATION_RELEASE_COMMIT=<R> MIGRATION_TARGET=production MIGRATION_PLAN_FILE=prisma/releases/2026-10-16-merge-all.sql MIGRATION_PLAN_SHA256=9da90192fbe9246ede1bd13a3d2c58eb0969fe691b30ce1a758295e6cb1a99e5 MIGRATION_BACKUP_REF=<copy name and time> npm run db:migrate:turso`. Stop on any error.
6. Verify: `node scripts/release-schema-check.mjs after` matches, and the ledger row for `R` is `applied`.
7. `git push origin <R>:main`, a fast-forward with no force. Stop if it is rejected.
8. Check the Vercel production deployment for `R` on GitHub, the automatic Production verify run, and `/api/health`.

### Recovery

- Failure before step 7: production keeps serving main. A partial apply shows as a `started` ledger row; the statements are idempotent, so a fixed re-run finishes it, and main's code ignores the added tables and columns either way.
- Bad deploy after step 7: promote the previous production deployment in Vercel, or push a revert commit. Main's code was tested on the migrated schema, so the schema stays.
- Schema itself must go: restore the Turso copy or the point-in-time time from step 3. That loses every write after the backup, so it is for data loss only, never for a code rollback.

## Refund ledger release (`cursor/operating-truth-10f0`, base `a6ab9de1`)

Not applied anywhere. Prepared and rehearsed on disposable databases only.

- File: `prisma/releases/2026-10-17-refund-ledger.sql`, sha256 `718732b85018cfa56fc01c9f6b65942d7e3367f3c431e6121d0eb3d0ba04de1f`. Two statements: `Payment.refundedCents` and `Deposit.refundedCents`, `INTEGER NOT NULL DEFAULT 0`. The same two lines are appended to `prisma/turso-migrate.sql` for fresh databases.
- Compatibility: additive with a constant default, so SQLite adds the columns without rebuilding the tables, and existing rows read 0 (no refund recorded). Code from `a6ab9de1` ignores the columns and keeps working against a migrated database. The new code selects the columns, so it must not run against an unmigrated database.
- Legacy data: rows already marked `refunded` count as fully refunded through `refundedOf`, so no backfill is needed. Partial refunds recorded before this release left no trace on the row (the old code only changed statuses), so totals for those stay as they were.
- Rehearsal: `scripts/operating-truth.test.mjs` applies the file through `applyMigrationPlan` to a disposable database that has old-shape rows, checks they read 0, checks that inserts without the column still work, and checks that a second run changes nothing. Separately, a database built from the `a6ab9de1` `schema.prisma` and then given this file has an empty `prisma migrate diff` against the new schema, so these two columns are the whole gap.
- Not registered: `MIGRATION_PLAN_FILES` in `scripts/turso-migrate.mjs` was left unchanged, because it is the reviewed-file allowlist for remote migration. Registering this file is a one-line change that belongs to the approval for this release. `ops/migration-targets.json` stays empty.
- Order: back up, apply the file, verify the two columns exist, then deploy the new code.
- Rollback: redeploy `a6ab9de1`. It reads the tables correctly with the columns present, so the columns can stay. Dropping them is not needed and would discard recorded refunds.
