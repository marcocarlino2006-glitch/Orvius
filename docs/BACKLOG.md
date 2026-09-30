# Orvius backlog — the one list

This is the single ranked list of what is broken, what limits scale, and what
separates Orvius from best in class. Work comes from here, top down. When an
item ships, mark it done with the PR link; do not start new lists elsewhere.

## What Orvius is (decided 2026-09-28)

**Now:** the receptionist that answers every call for an HVAC shop, books the
job on the calendar, and texts the owner. One promise: *you never lose a job to
a missed call.* Nothing ships that doesn't make that promise truer, faster or
easier to buy.

**Path:** (1) win HVAC with the receptionist, target 1,000 paying shops;
(2) become where the job lives, by syncing into ServiceTitan, Housecall Pro and
Jobber before replacing anything; (3) take a share of the money that flows
through booked jobs (deposits, invoices, financing); (4) plumbing, electrical,
then franchises.

**Scoreboard, weekly:** paying shops · booked jobs per shop · calls answered
without failure · signup to first booked job, in minutes · monthly churn.

**Rules:** reliability before features; the product demos itself (call it,
hear your shop); build on the best models, never our own; one list (this file).

Last full inspection: 2026-09-28 (call path, money path, platform, product surface).

Status: `open` · `in PR` · `done` · `needs owner` (a decision, key, or approval only Marco can give).

---

## Tier 0 — Stop the bleeding (money and trust bugs, confirmed in code)

| ID | Problem | Evidence | Status |
|----|---------|----------|--------|
| B1 | A canceled shop's line keeps answering and costing Twilio and Vapi minutes. Cancel only changes `billingStatus`; nothing turns the line off. | `src/lib/billing-sync.ts` (subscription sync), Vapi assistant stays attached | done — decided: suspend at cancel, keep 30 days |
| B2 | Deleting a workspace or an admin deleting a shop does not release the Twilio number, so it bills forever. | `src/lib/workspace-deletion.ts`, `src/app/api/businesses/route.ts` | done — released on delete |
| B3 | Two onboarding submits at once can buy two numbers and create two shops. Same for the auto line fix on parallel page loads, and a retry after a failed rollback. | `src/app/api/onboarding/route.ts`, `src/lib/provision-business.ts` (no lock; `ownerEmail` not unique) | done [#80](https://github.com/marcocarlino2006-glitch/Orvius/pull/80) (lease + reuse); resumable UI still open under G3 |
| B4 | Checkout does not check the signup gate, so a non-invited person can pay and then be refused a shop. A paid checkout abandoned before onboarding leaves a charge with no shop and no follow-up. | `src/app/api/billing/checkout/route.ts`, `src/lib/billing-sync.ts` | done — checkout gated; abandoned-checkout follow-up still open (G4) |
| B5 | A time held during the call is booked without re-checking capacity, so a slot taken in between can be double-booked. | `src/lib/auto-job.ts` held-slot path, `src/lib/job.ts` `createJobFromLead` | done [#80](https://github.com/marcocarlino2006-glitch/Orvius/pull/80) |
| B6 | The in-app "test call" marks the line verified without a real call, and writes a fake "1842 Oak Street" address onto the real shop. | `src/app/api/onboarding/test-call/route.ts` | done [#80](https://github.com/marcocarlino2006-glitch/Orvius/pull/80) |
| B7 | `/api/admin/mastery` answers any signed-in user with platform-wide numbers (waitlist counts, shop counts, readiness gates). | `src/app/api/admin/mastery/route.ts` (no founder check) | done [#80](https://github.com/marcocarlino2006-glitch/Orvius/pull/80) |
| B8 | The daily cron hides failures: line watch, weekly reports, overage billing and autopilot errors become `null` with no log and the job reports ok. | `src/app/api/cron/notifications/route.ts` `.catch(() => null)` | done [#80](https://github.com/marcocarlino2006-glitch/Orvius/pull/80) |
| B9 | Alerts can be lost or doubled on a crash: an inbound text's owner alert is lost if the function dies after the lead is saved; the customer confirmation text is best-effort after response; an owner text can send twice if the function dies between Twilio and the DB write. | `src/app/api/webhooks/twilio/sms/route.ts`, `src/lib/job.ts`, `src/lib/notification-queue.ts` | done [#80](https://github.com/marcocarlino2006-glitch/Orvius/pull/80) for lost text alerts; duplicate send on crash and durable confirm text still open |
| B10 | A Stripe refund does not update the deposit or invoice, which stays "paid". | `src/app/api/billing/webhook/route.ts` (no refund events) | done [#80](https://github.com/marcocarlino2006-glitch/Orvius/pull/80) |
| B11 | `past_due` shops keep full access forever, and their overage is never billed. | `src/lib/billing-entitlement.ts`, `src/lib/overage-billing.ts` | done — 7-day grace |
| B12 | Sprint fixes waiting on merge: false "alerts not delivering" warning, info-only calls graded as missed bookings, invited members sent to signup. | [PR #76](https://github.com/marcocarlino2006-glitch/Orvius/pull/76), [PR #77](https://github.com/marcocarlino2006-glitch/Orvius/pull/77) | done (#76, #77 merged) |

## Tier 1 — Scale bottlenecks (what breaks at hundreds or thousands of shops)

| ID | Problem | Evidence | Status |
|----|---------|----------|--------|
| S1 | The hottest shop lookups have no index: owner email, Twilio number, Vapi number, Stripe customer. Every call, text and sign-in scans the shop table. | `prisma/schema.prisma` `Business` | done [#80](https://github.com/marcocarlino2006-glitch/Orvius/pull/80) |
| S2 | The end-of-call webhook books the job and assigns a tech (up to 12 reslot rounds) before replying to Vapi, risking timeouts and retries under load. | `src/app/api/webhooks/vapi/route.ts`, `src/lib/call-ingest.ts` | done — [PR #82](https://github.com/marcocarlino2006-glitch/Orvius/pull/82) |
| S3 | Every availability check loads all open jobs for the shop, and the slot scan is slots × jobs. A live-call tool can also wait 2.5 s on a calendar fetch. | `src/lib/job.ts`, `src/lib/availability.ts`, `src/lib/busy-calendar.ts` | done — [PR #82](https://github.com/marcocarlino2006-glitch/Orvius/pull/82) |
| S4 | The Command page poll runs 20+ database queries each time. | `src/app/api/ring1/route.ts`, `src/lib/attention-queue.ts` | done — [PR #82](https://github.com/marcocarlino2006-glitch/Orvius/pull/82) |
| S5 | The daily cron handles shops one at a time and stops at 200 shops without saying so. Owner alert retries for quiet shops wait for that daily run. | `src/app/api/cron/notifications/route.ts`, `src/lib/drain-owner-alerts.ts` | done [#80](https://github.com/marcocarlino2006-glitch/Orvius/pull/80) |
| S6 | All shops text from one shared sender; replies route to whichever shop texted that phone last. Carrier registration (toll-free or 10DLC) is handled outside the product. | `src/lib/twilio-sms.ts`, `src/lib/resolve-shop-line.ts` | needs owner (Twilio verification status) |
| S7 | Turso is a single writer. Fine now; a ceiling later. | `src/lib/prisma-libsql-concurrent.ts` | watch |
| S8 | Some state lives in one server's memory (autopilot last run, assistant sync cache, fallback rate limits), so it resets across instances. | `src/lib/autopilot.ts`, `src/lib/sync-business-assistant.ts`, `src/lib/rate-limit.ts` | done (#86) — rate limits and assistant cache were already safe; autopilot overlap could double-text customers, now claimed once |
| S9 | `puppeteer` is a production dependency though only scripts use it. | `package.json` | done — [PR #84](https://github.com/marcocarlino2006-glitch/Orvius/pull/84) |

## Tier 2 — Let shops buy and go live without Marco

| ID | Problem | Evidence | Status |
|----|---------|----------|--------|
| G1 | Email is off in production (`RESEND_API_KEY` missing): no magic links, no email alerts, no dunning. | production magic-link endpoint | needs owner |
| G2 | Public self-serve signup is switched off; shop creation is invite-only. Multi-shop is sales-only. | `src/lib/self-serve-signup.ts`, `src/lib/pricing-plans.ts` | needs owner (when to open) |
| G3 | Setup cannot reliably resume, and "ready" does not require call forwarding, so a shop can go live catching only calls to the new number. | `src/lib/owner-setup-state.ts`, `src/components/onboarding-wizard.tsx` | done — [PR #83](https://github.com/marcocarlino2006-glitch/Orvius/pull/83) |
| G4 | No payment-failed emails, no "finish setup" nudge after paying, no near-limit usage alert. | `src/app/api/billing/webhook/route.ts`, `src/lib/call-usage.ts` | done — [PR #85](https://github.com/marcocarlino2006-glitch/Orvius/pull/85); texts now, email once RESEND_API_KEY is set |
| G5 | The "hear your shop" preview is built but dormant until the demo number is switched to server-URL mode in Vapi. | [PR #78](https://github.com/marcocarlino2006-glitch/Orvius/pull/78) | in PR — needs owner approval for the live switch |
| G6 | No number porting; only new numbers plus forwarding guides. | `src/lib/twilio-phone.ts`, `src/lib/carrier-forward.ts` | later |
| G7 | Stripe test-mode lifecycle not yet proven end to end (sprint ticket 5). | — | needs owner — a Stripe test-mode secret key |

## Tier 3 — Master class (what makes it clearly the best)

| ID | Gap | Evidence | Status |
|----|-----|----------|--------|
| M1 | Voice reply time is p50 1.08 s / p90 1.79 s; best in class feels under 0.8 s. | `docs/VOICE-RESULTS.md` | measuring (#91): every call now stores reply p50/p90 + stage medians; `/api/admin/voice-latency` names the slowest stage. Next: cut the slowest stage once a week of real calls is in |
| M2 | Transfer to a person is a cold transfer only, and gas or CO safety calls alert after the call instead of transferring live. | `src/lib/vapi.ts`, `src/lib/in-call-tools.ts` | done ([#88](https://github.com/marcocarlino2006-glitch/Orvius/pull/88)) — danger calls text the owner mid-call (`alert_team_now`) and transfer warm with a spoken briefing when a transfer number is set; still needs one live test call |
| M3 | No ServiceTitan, Housecall Pro or Jobber sync, and Google Calendar is read-only busy blocks. These are what real shops run on. | `src/lib/jobber.ts`, `src/app/api/integrations/jobber/*`, `src/app/api/webhooks/jobber` | Jobber done (this PR): Settings → Integrations → Connect Jobber (OAuth + PKCE); every new-work call becomes a Jobber request on the client matched by phone (or created once), sent right after the call and retried from the 30-minute line-watch. At most once: a lost reply is held as `check`, never resent. Tokens sealed with `ORVIUS_TOKEN_KEY`; `APP_DISCONNECT` webhook wipes them. Needs `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET`, `ORVIUS_TOKEN_KEY` in Vercel and a Jobber app with redirect `/api/integrations/jobber/callback` and webhook `/api/webhooks/jobber`. Housecall Pro and ServiceTitan open |
| M4 | The voice test suite never runs the live booking tools or transfer, so the most valuable path is ungated. | `scripts/voice-sim.mjs`, `src/lib/voice-sim-tools.ts` | done ([#89](https://github.com/marcocarlino2006-glitch/Orvius/pull/89)) — sim now runs the production receptionist with its tools (sandboxed, no database) and grades which tools each call used. The nightly still skips until `VAPI_API_KEY`, `VOICE_SIM_RECEPTIONIST_PHONE_ID` and `VOICE_SIM_CALLER_PHONE_ID` are set as repo secrets (owner) |
| M8 | Consumer AI assistants (Meta Muse's calling beta) now phone businesses for customers; the receptionist was told to end "robo" calls and could drop them as spam. | `src/lib/business.ts`, `scripts/voice-scenarios.mjs` | done (#93) — a customer's AI assistant is served as a customer (customer's details captured, never told a time is confirmed); two sim scenarios, booking one gated. Needs one live sim run |
| M10 | A caller nobody reaches is lost to the next shop they call; the board flagged them but nothing followed up. | `src/lib/lead-follow-up.ts`, `src/app/api/leads/[id]/follow-up`, `src/app/api/webhooks/twilio/sms` | done (this PR) — follow-up agent: an unworked service lead gets one text after 3h (9am to 8pm shop time; never emergencies, booked customers, STOP, or twice a week to one person). Settings: "Draft it, I tap send" (default), "Send it for me" (30-minute cron) or Off. A reply attaches to the original lead and alerts the owner instead of opening a second lead |
| M9 | Real calls that go wrong are graded but never replayed, so the same failure can ship again. | `src/lib/learned-scenarios.ts`, `scripts/voice-sim.mjs` | done (#94) — every graded failure becomes a de-identified sim scenario (`/api/admin/learned-scenarios`); nightly replays them with `--learned` once `ORVIUS_ADMIN_KEY` is a repo secret. Learned scenarios never gate; promote the ones that matter |
| M5 | On a call, customers cannot reschedule, cancel or ask job status. | `src/lib/in-call-tool-defs.ts` | done (#95) — status and technician ETA from the caller note once the caller confirms their name; a new time is held with `hold_new_time` and the owner is texted the exact move; that hold can never become a second job (it did before when the visit was booked over 7 days earlier). Cancel is captured for the owner to confirm. Auto-applying the move is a later step |
| M6 | The owner app on a phone is the desktop layout shrunk; no phone-first "tonight" view. The first-night handoff screen is built but never shown. | `src/components/os-shell.tsx`, `FirstNightHandoff` unmounted | open |
| M7 | No tests for call ingest, provisioning or billing sync directly. | `scripts/billing-core.test.mjs`, `scripts/provision-core.test.mjs` | done ([#90](https://github.com/marcocarlino2006-glitch/Orvius/pull/90)) — call ingest was already covered (23 direct calls); billing sync now runs against a local stand-in Stripe, and provisioning's refusals are tested. Found and fixed: a second checkout double-charged an active shop, an extra subscription's cancel suspended a paying shop's line, and a canceled shop with a released number would auto-buy a new one on dashboard load |

## Tier 4 — Focus and cleanup (cost of carrying too much)

| ID | Problem | Evidence | Status |
|----|---------|----------|--------|
| F1 | About 22,000 lines of CSS across 10 files, with five button systems and three color token sets. | `src/app/*.css`, `src/app/dashboard/*.css` | open |
| F2 | Jobs, Dispatch, money (estimates, invoices, deposits), Ask and Portfolio ship beside a stated receptionist wedge; several are marked beta. | `src/lib/os-nav.ts`, `src/lib/company.ts` | needs owner (hide beta rings until the wedge pays?) |
| F3 | Claims to tighten: a "LIVE" badge on the illustrative sign-in feed; the compare table's unconditional "Yes" rows; a P95 alert latency promise with no readout. | `src/components/signin-board.tsx`, `src/components/home-compare.tsx`, `src/lib/institutional-standards.ts` | open |
| F4 | Summit and "1842 Oak Street" placeholders appear in real-shop settings and onboarding. | `business-section.tsx`, `onboarding-wizard.tsx` | done — [PR #84](https://github.com/marcocarlino2006-glitch/Orvius/pull/84) |
| F5 | Call recordings and transcripts are kept forever; customer links (confirm, invoice, deposit) never expire; a shop's calendar feed cannot be revoked alone; backups are manual. | `src/lib/retention.ts`, `src/lib/calendar-feed.ts`, `src/lib/customer-confirm.ts` | done (#87) — daily purge after 24 months (ours, Vapi, Twilio voicemail); confirm links close a day after the visit, tech links a week after; per-shop calendar link reset. Invoice and deposit links stay open until paid on purpose (an expired unpaid invoice is lost money). Backups: nightly encrypted backup + restore drill (`.github/workflows/backup.yml`, #92); runs once the owner sets BACKUP_DATABASE_URL, BACKUP_TURSO_AUTH_TOKEN, BACKUP_ENCRYPTION_KEY |
| F6 | Repo clutter: 33 strategy docs in `docs/`, about 34 one-off scripts, 42 untracked `.tmp-*.mjs` files in the root. | `docs/`, `scripts/` | open — root scratch files removed and gitignored; docs/scripts consolidation left |

---

## Decisions (made 2026-09-28)

| Question | Decision | Why |
|----------|----------|-----|
| Failed payment | 7 days of full access while Stripe retries, then the workspace locks. Calls keep being answered and alerted the whole time. Overage is billed for past-due shops too. | Most failed cards are fixed within a week; the shop's customers should never feel our billing problem. |
| Cancellation | The AI stops answering at once (callers hear a short "not taking calls" message), so we stop paying for minutes. The number is kept 30 days; paying again restores the line on the same number. | Keeps win-back cheap and honest: same number on the truck, no free service. |
| Number release | Numbers of shops canceled over 30 days are released by the daily cron. Starts in report-only mode; set `ORVIUS_RELEASE_LAPSED_LINES=1` after reviewing the first week's `line.release.dry_run` logs. | Releasing is permanent, so the first run is watched. |
| Workspace or shop deleted | The number and assistant are released immediately. | The owner said they are done; nothing should keep billing. |
| Paying before signup opens | Checkout refuses anyone who couldn't create a shop afterwards. | Never take money we can't turn into a working line. |
| Self-serve signup | Open it (`ORVIUS_SELF_SERVE_SIGNUP`) once `RESEND_API_KEY` is set, so sign-in links and billing emails work. | A signup that can't email its owner isn't self-serve. |
| Recordings and transcripts | Keep 24 months, then purge (built in F5; privacy page says so). | Long enough for disputes and warranty callbacks; not forever. |
| Beta features (Jobs, Dispatch, money, Ask, Portfolio) | Frozen: no new work until the receptionist hits 1,000 paying shops. Kept visible for shops already using them. | Focus. |

## Still needs Marco

1. Add `RESEND_API_KEY` in Vercel.
2. Tell me the Twilio toll-free or 10DLC verification status (S6).
3. In Stripe, make sure the webhook receives `charge.refunded` (including connected accounts).
4. Switch the demo number to server-URL mode in Vapi, so the `/try` preview goes live (G5).

## Order of work

1. B3 + G3 (sprint ticket 3): no duplicate numbers, resumable setup, truthful checklist.
2. B5, B6, B7, B8, B9, B10: small, confirmed, high-trust fixes.
3. S1, S2, S3, S4, S5: scale.
4. B4, G4, G7: money path proven in Stripe test mode (sprint ticket 5).
5. M1 to M4, then F1 to F6.
