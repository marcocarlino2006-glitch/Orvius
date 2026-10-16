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
| Authority | Money power is a scoped owner grant, not a role: only the owner holds `money.adjust`; anyone else needs a `FinancialGrant` for one scope (`confirm_payment`, `revise_bill`, `price_book`, `resolve_payment`), still a teammate, unexpired (90 days at most), unrevoked, under the current policy version and within its amount cap. Checked when the action runs; use is logged with the grant id. Owner-only `/api/money-grants` issues, lists and revokes | Fixed and integrated (API only; no settings screen yet) | 7bfef23 (`money-authority.ts`; `scripts/money-authority.test.mjs`) |
| Authority | Command plans inside the 12-hour window are rechecked at execution: lead booked or lost, technician inactive or busy, approver's grant revoked, proposer removed from the team, job closed, window gone | Fixed and integrated | bc10a2e (`scripts/command-stale.test.mjs`) |
| Authority | Integration and team-admin routes already need `settings.edit` or `team.manage` | Already in place; verified | route audit |
| Delivery | A carrier "failed" after "delivered" no longer reopens or resends the owner alert, flips the intent ledger, or reports a failed customer confirmation | Fixed and integrated | faa0e35 |
| Delivery | Email the mail service accepted is recorded as accepted, never delivered; test alert copy says sent | Fixed and integrated | faa0e35 |
| Delivery | Open reconciliation exceptions are visible on Command, linked to the job, and resolving one records what was done | Fixed and integrated | 03385a6 |
| Delivery | Severe SMS lost replies are unknown, never retried blind, one exception each | Already in place; verified | `sms-intent.ts` |
| Delivery | Uncertain Stripe and Vapi effects: each is recorded (provider, operation, correlation key, idempotency key, entity) before the call. A lost reply leaves it `uncertain` with a Command exception; a retry inside Stripe's idempotency window replays the same key, after it the effect is found by its tag or refused, never re-created blind. A local save failure after the provider accepted leaves it `accepted` and the retry finishes from the provider's record. Covered: invoice, estimate and deposit checkouts, Connect account creation, receptionist creation during provisioning. Admin stuck-effects list at `/api/admin/provider-effects` | Fixed and integrated for those callers | 3b8c537 (`provider-effect.ts`; `scripts/provider-effects.test.mjs`) |
| Delivery | Other Stripe writes (plan checkout, overage invoice, money-back refund, subscription updates) and the staff-created shop's receptionist | Not on the effect record. The money ones already use deterministic idempotency keys and look up the provider before creating, so they don't duplicate blindly, but a lost reply isn't shown as an exception | — |
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
- Managers lose those same money actions unless the owner issues a scoped money grant. There is no settings screen for grants yet (API only), so on release a manager who did these today would be refused until the owner grants it. No real tenant's grants were created or migrated.
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

Integrated: the test-mode workspace (`/dashboard/onboarding`, `turn-on-orvius.tsx`, `/api/setup`) stores its step, goal, team, permissions and test result in `Business.setupJson` on the server, so a reload or another device resumes at the saved step. Payment recovery is server-side (`/api/onboarding?resume=1` rebuilds from a paid checkout), and going live goes through the activation approval above.

Remaining gaps:
- **Progress.** `setupJson.step` is a single "where they are", not a record of which steps finished. `/api/setup` `step` accepts any step, so a client can jump to `test` or `live` without the earlier steps saved.
- **Resumability.** The production (non-test-mode) wizard keeps its form in the browser; only the paid-checkout rebuild resumes on the server. An abandoned checkout leaves the test workspace, but anything typed into the checkout form must be re-entered.
- **Capabilities by prerequisite.** Booking, follow-ups and deposits are switched by the permission level chosen, not by checking what they need (hours and services for booking, a verified owner phone for alerts, a ready Stripe account for deposits). The go-live checklist lists these but doesn't gate them.
- **Failed-step recovery.** A failed test call or a line purchase that fails after payment is retried by the owner pressing the button again; there is no per-step failure state, retry count or "what went wrong" kept on the server. Provider effects (above) prevent a duplicate receptionist or Connect account, but the setup UI doesn't show an uncertain effect.

## Schema and migrations

All additive. Applied only to disposable local SQLite databases in this pass.

| File | sha256 |
|---|---|
| `prisma/schema.prisma` | `68b8e3677c7395b6e4fcdf9770e48bcbeefe939a97e0af335226e7b48e1cc583` |
| `prisma/turso-migrate.sql` (full file) | `913b311454f272268d44b1470c9254a29436c3559a4464506c312d12a49418b4` |
| `prisma/turso-migrate.sql` lines added since `dd5c23f` (64 lines, none removed: `Call` offer and consent columns, `NetworkHandoff.sharesJson`, `ActivationAcknowledgement` with actor kind and attestation, `ShopRecordContract.replicasJson`, `ProviderEffect`, `FinancialGrant`), extracted with `git diff dd5c23f -- prisma/turso-migrate.sql \| grep -E "^\+[^+]" \| sed 's/^+//'` | `91222c8ce0cd99dd0485e4b91ce13a68d084c187428859f220a81c6d356930ec` |
| `prisma/prepared/receivables-v1.sql` (prepared, not executed, header comment only changed) | `26979e36ee67697b5b4bf49ed6be1548c7347d2fbe263b5e53b9633327d8dd86` |

The base `turso-migrate.sql` at `dd5c23f` hashed `20f8abf8adb7a69972413c0905dcd434ace14ca1303961b7443b9144004202b7`.

## Validation

Clean checkout of commit `45f6689fc0044d880899dd2312e7b520dda0e85a` in a detached worktree. The only env file present was the tracked `.env.example`, the database was a disposable local SQLite file, and no provider credentials were loaded.

- `prisma db push` to the disposable database: ok
- `tsc --noEmit`: exit 0
- `npm run test:trust`: 1572 tests, 1572 pass, 0 fail (new in this pass: `activation-paths`, `provider-effects`, `record-authority`, `money-authority`, `command-stale`, `money-invariants`, `proof-report`; extended: `tool-call-speed`, `authority-boundaries`, `checkout-concurrency`, `signup-scale`)
- `npm run build`: exit 0
- `git diff --check 39b17d7..HEAD`: clean (one trailing blank line inherited from `4e0fc23` in `src/lib/job.ts` was removed in `45f6689`)
- `eslint --quiet src`: no errors. One warning in `jobs/page.tsx` that was already present at the base commit.

The commit after `45f6689` changes only this file.

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
12. A manager account on a staging shop with and without a money grant, once a settings screen for grants exists.

## Rollback

Rolling code back to an earlier release changes which code serves requests. It does not undo schema changes, and it never deletes or rewrites payments, receipts, refunds, deposits, audit events or message history. Every migration in this repo is additive so an older release can still read the database. A data correction is a separate, reviewed and authorized operation with its own backup reference, never a side effect of redeploying older code.
