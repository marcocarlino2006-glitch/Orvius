# Governed execution pass

Branch `cursor/governed-execution-10f0`. Local only: nothing pushed, no PR, nothing merged or deployed, no migration executed against any shared or production database, no provider called, no message sent, no money moved.

## Base and reconciliation

The branch starts from `main` at `39b17d7`. On top of it are the 34 commits of `cursor/operating-loop-review-10f0` (tip `d70c950`), reviewed one by one against these instructions before anything new was written. The "34 unpublished Cursor patches" are only accepted as evidence in that form: reviewed commits with their diffs. No `/tmp` path or unsupplied patch is relied on.

| Reviewed item (operating-loop-review) | Outcome here |
| --- | --- |
| The paid voice gate runs on a label or a confirmed manual run (`42b303c`) | Replaced. `7ed1471` drops the label trigger. A run needs the protected environment and a budget-owner authorization bound to commit, numbers, destinations, scenarios, caps and budget. |
| `turso-migrate` runs inside the Vercel build, guarded by host checks (`42b303c`) | Replaced. `09ae8ef` keeps builds pure. A remote migration refuses before connecting unless approval, the exact release commit, an allow-listed target, a reviewed checksum and a backup are all named. |
| `prod:verify` with an optional `EXPECTED_COMMIT` (`3e8ca31`) | Tightened. `09ae8ef` makes it required. |
| Command approvals for manager/dispatcher by role (`24489a0`) | Replaced. `fd0d334` adds owner-issued, expiring, action-scoped grants, rechecked at execution. Money, settings, phone, team and deletion are never grantable. |
| Owner clash check with shop hours and override detail (`df59306`, `1a7e01d`, `cf58ec6`) | Kept and folded into the scheduling policy (`1da19d5`). Overrides now need authority plus a reason and write the full record. |
| Online booking claims capacity in the booking transaction (`ff3521b`) | Kept. The policy gap is added to the same claim. |
| One invoice per job and one open checkout per bill (`d75e306`) | Kept as the live safeguard. The canonical receivable (outcome 3) is prepared beside it, not swapped in. |
| Value check credits only traced jobs (`8ee3978`) | Kept as a product number. It is not proof or causal attribution. The proof-loop metric (outcome 9) reports the call/text-lead count separately as association only. |
| Everything else (safety classifier, callback provenance, demo fences, readiness, exports, sweeps, claims copy) | Kept unchanged. Each is compatible with these instructions and already has tests. |

## Commits in this pass (small, one outcome each)

| Commit | Outcome |
| --- | --- |
| `09ae8ef` | 8. Pure builds and an approved migration/release step |
| `7ed1471` | 7. Paid voice tests are manual, isolated and off by default |
| `fd0d334` | 5. Command grants |
| `1da19d5` | 1. Per-shop scheduling policy including travel |
| `4e0fc23` | 2. One job transition service |
| `660e5a7` | Test follow-up to 1 (a new test-mode shop holds until the owner sets job spacing) |
| `285ab0f` | 4. SMS intent ledger |
| `ce06e20` | 3. Canonical job receivables, prepared and not executed |
| `b0dd3fe` | 6. Overage economics: observed, not changed |
| `e20beaa` | 9. Operating-platform proof loop |

## Decisions

**1. Scheduling policy (`src/lib/scheduling-policy.ts`)**
- A shop with no policy row is `legacy_no_travel_policy` and behaves exactly as before.
- New shops get `not_configured`. Voice, auto-book and the booking page hold for the owner until the owner picks `duration_only` (gap 0) or `min_gap` (1–240 minutes).
- No drive-time, routing, GPS or ETA is invented. The old 30-minute ZIP warning is gone.
- A positive gap checks the assigned technician's immediately preceding and following open jobs. That check runs in slot search, the booking transaction, auto-assign, owner clash checks and dispatch.
- An override needs either the owner, or a person holding an active `schedule_override` grant, plus a non-empty reason.
- The override record holds: actor and role, before and after, policy version and gap, adjacent job IDs, source freshness, the notification plan, and the path it came through.
- Legitimate owner moves are never banned outright.

**2. Job transitions (`src/lib/job-transition.ts`)**
- Every status write goes through `transitionJob`. `updateJobStatus` refuses `completed` and refuses moves out of a terminal status.
- Field completion needs `on_site`, an outcome, and a price or an explicit no-charge.
- Remote completion is allowed only when the shop switched it on and the outcome is a remote kind.
- Office corrections need owner or manager, a reason and an evidence source.
- AI and system actors can never complete a job.
- Reopen needs owner or manager and a reason. It keeps `completedAt`, keeps money facts, never touches a paid invoice, and re-runs the schedule check.
- Known inline exceptions, each audited: the reschedule reset from confirmed to scheduled, and the tech-app on_site stamp.
- There is no reopen screen yet; reopen is API-only.

**3. Receivables (`prisma/prepared/receivables-v1.sql`, `src/lib/receivable-ledger.ts`)**
- Prepared and not executed. The tables are kept out of `prisma/turso-migrate.sql` and the Prisma schema, and no live path calls the library.
- The database enforces:
  - one canonical receivable per shop and job, with any number of non-canonical rows, including `jobId = NULL`;
  - issued revisions are frozen and can be superseded only while no payment or deposit application exists;
  - payment, deposit-application, adjustment, credit, refund and checkout-attempt facts are append-only while the shop exists. Shop deletion still cascades.
- Deposits stay in `Deposit`. Applying one is a dated fact, capped across bills at what was paid.
- Plan charges are their own non-canonical receivables.
- A payment on a superseded revision's checkout is recorded (the money is real) and flagged `late_old_session`. Paying past the balance is flagged `overpaid`. Neither refunds anything by itself.
- The backfill is a dry-run plan (`planReceivableBackfill`). It picks one canonical invoice per job by status, then recency, and lists conflicts for a person: money on two invoices, or a deposit larger than its bill. It resolves none of them.
- Because trigger bodies contain semicolons, this file is applied with `executeMultiple` under the approved migration step, not through the `turso-migrate` statement splitter.

**4. SMS intent ledger (`src/lib/sms-intent.ts`, `sendSms`)**
- Before the provider call, each operational text claims a row keyed by shop, event type, event id, normalized recipient, channel and message version.
- Twilio has no message idempotency header and none is invented. There is no exactly-once claim.
- Error classification:
  - A 4xx from Twilio is a definite refusal. A 429 is retryable, bounded to 3 attempts.
  - Recipient refusals never reroute through another sender. A carrier STOP is written down.
  - Anything else (timeout, reset, 5xx) is `unknown_submission`: no retry, no shared-sender fallback.
  - A lease that expired mid-send becomes `unknown_submission`.
- Severe messages raise one deduped owner exception on unknown, rejected, exhausted or undelivered. Severe means on-the-way, tech assignment and reschedule, and the emergency backup page.
- Receipts append once per status. `delivered` and `undelivered` settle the intent.
- A resend, a reminder or an ETA/time change is a new version, or a new event, linked to the prior intent and carrying who authorized it.
- Keyed call sites:
  - confirm request (first send, owner resend) and confirm reminder;
  - on-the-way;
  - tech assigned and tech rescheduled;
  - invoice pay link (each send is a version: owner, technician or autopilot);
  - owner paid alert (per checkout session);
  - emergency backup page;
  - tech-app arrived and finished;
  - deposit link;
  - approved Command follow-up (per proposal);
  - plan joined.
- Not keyed:
  - human-authored thread messages and owner `TEXT` relays, which a person writes each time;
  - the owner alert queue, which keeps its own `OwnerNotification` ledger and retry ladder.

**5. Command grants (`src/lib/command-authority.ts`)**
- Grants are owner-issued, expiring, per person and per plan type, and rechecked at execution.
- `schedule_override` is a grant only for overrides; it is not a plan action.

**6. Overage economics (`src/lib/overage-economics.ts`)**
- A pure rolling 30-day report. `OVERAGE_CENTS_PER_CALL = 50`, prices, terms, allowances and Stripe objects are untouched. The report carries no cutoff, throttle or price decision.
- Every cost line names its source: provider-reported voice, telephony estimated at list rate, SMS reported/estimated/mixed, metered model spend, and numbers/A2P/storage from invoice or estimate.
- It reports:
  - the billable denominator and its exclusions (demo, test, self-test, pilot, unanswered, out of window);
  - cost coverage;
  - distributions;
  - cost-tail, long, urgent and human-transfer calls with their share of cost;
  - effective monthly vs annual revenue (net of discounts, credits and refunds; annual recognized over 365 days);
  - signup cohorts;
  - overage invoiced, collected, failed, refunded, disputed and outstanding, plus the sub-dollar waiver.
- Pilots (never billed) and past-due shops (still answered, unpaid overage shown) stay visible.
- Feeding it real data needs read-only access to call costs and Stripe invoices. That is a separate, owner-authorized step, not done here.

**7. Paid voice tests** (`7ed1471`, `.github/workflows`)
- No schedule or label trigger.
- A run needs a manual dispatch in the protected environment and a budget-owner authorization file. Both are checked before any provider call.

**8. Builds and release** (`09ae8ef`)
- `npm run build` never migrates.
- `scripts/turso-migrate.mjs` refuses before connecting unless approval, release commit, allow-listed target, reviewed checksum and backup are all present.

**9. Proof loop (`src/lib/system-of-record.ts`, `/api/record-contract`)**
- The per-shop system-of-record contract covers customer, availability, job state, price/invoice, payment/receipt and notifications. It is versioned and append-only, changed only by the owner, and audited. A shop without one runs on Orvius defaults as version 0.
- External correlations are written once, stamped with the contract version, and unique on both sides. A repoint becomes a reconciliation exception, never an overwrite.
- Create, change, cancel, complete and payment disagreements each raise one deduped exception. An owner or manager resolves it with a stated resolution, scoped to their own shop.
- `correlationsFromSyncRows` maps existing Jobber and QuickBooks sync rows into correlations as a dry run. The live sync code is not changed.
- `proofLoopMetrics` counts a closed loop only when all of these hold:
  - a real inbound (call, text or web) on a production shop;
  - completion through the transition service, not a correction;
  - money tied to that job;
  - a correlation where an external system owns job state;
  - no open exception.
- It excludes demos, setup sandboxes, self-tests, account creation, aggregate-only payments and non-inbound jobs, and counts each exclusion.
- The call/text-lead job count is reported beside it as association only. The output is labelled `observed_not_causal`.

## Migration SQL

| File | SHA-256 | Status |
| --- | --- | --- |
| `prisma/prepared/receivables-v1.sql` | `715e0c2b25a70b11f82fad2a3386fe570375d279af0f28b939830e31d352bfb0` | Prepared only. Tested on a throwaway libsql file created and deleted by `scripts/receivable-ledger.test.mjs`. |
| `prisma/turso-migrate.sql` (whole file after this pass) | `20f8abf8adb7a69972413c0905dcd434ace14ca1303961b7443b9144004202b7` | Additive blocks appended (below). Applied only by the approved release step, with this checksum named. |

These additive blocks are appended to `turso-migrate.sql`, using only `CREATE TABLE IF NOT EXISTS`, `CREATE [UNIQUE] INDEX IF NOT EXISTS` and nullable `ALTER TABLE ... ADD COLUMN`:
- `CommandGrant` plus approval columns on `CopilotAction`;
- `ShopOperatingPolicy`;
- `SmsIntent`;
- `ShopRecordContract`, `ExternalCorrelation` and `ReconciliationException`.

Existing rows are not changed, and no backfill runs. `scripts/turso-migrate.test.mjs` parses the real file as the release step does.

## Fixtures (synthetic, no real records)

- `scripts/fixtures/receivables-backfill.json`: invoices, payments and deposits covering a redrafted job, money on two invoices, a job-less invoice, a voided invoice, applied and oversize deposits, and an unpaid deposit.
- `scripts/fixtures/overage-cost-tail.json`: covers each of these:
  - monthly, annual-with-discount, past-due, pilot, demo and self-test shops;
  - a cost tail, plus long, urgent, transfer and unreported calls;
  - overage across every outcome, plus the sub-dollar waiver.
- `scripts/fixtures/proof-loop.json`: one job per exclusion reason, plus three closed loops.
- In-test fixtures: disposable shops in each Prisma test, and a mocked Twilio client in `scripts/sms-intent.test.mjs`.

## Test evidence

These new suites are added to `npm run test:trust`. Each runs on a disposable SQLite or libsql file with providers mocked or absent:
- `scripts/command-authority.test.mjs`
- `scripts/scheduling-policy.test.mjs`
- `scripts/job-transition.test.mjs`
- `scripts/sms-intent.test.mjs`
- `scripts/receivable-ledger.test.mjs`
- `scripts/overage-economics.test.mjs`
- `scripts/system-of-record.test.mjs`

Clean-checkout validation at commit `d321019`: a fresh `git worktree`, no `.env` (only the tracked `.env.example`), and `DATABASE_URL` pointed at a new disposable SQLite file.

| Check | Result |
| --- | --- |
| `prisma db push` on the disposable file | ok |
| `tsc --noEmit -p .` | exit 0 |
| `npm run test:trust` | 1478 tests, 1478 pass, 0 fail |
| `npm run build` | exit 0 |

## Not done here, by instruction

- No push, PR, merge or deployment.
- No production or shared-database migration, including the receivables SQL.
- No live paid voice test, real message, provider connection, charge or refund.
- No change to prices, terms, Stripe IDs, allowances, secrets, workflows' live permissions or account security.
