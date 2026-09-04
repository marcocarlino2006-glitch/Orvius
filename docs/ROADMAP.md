/**
 * Orvius roadmap — where we are (as of 2026-09-04).
 *
 * Realistic ceiling: vertical OS for HVAC / plumbing / electrical (tens of billions).
 * Not fantasy. Product is ahead of cash, distribution, and legal.
 *
 * Live snapshot: 3 pilot shops · 5 leads · 5 calls · 4 jobs · $0 ARR · 0 waitlist prospects
 * Summit HVAC: wedge 8/8 · pilot ends 2026-09-30 · no baseline / no weekly proof yet
 * orvius.im: 200 · billing:check: 5 Stripe blockers · formation state: unconfirmed
 */

## Scoreboard

| Layer | Status | Reality |
|-------|--------|---------|
| **Product / wedge** | Strong | Summit 8/8; exclusive line; auto-book; wedge-first homepage |
| **Trust / ops gates** | Mostly green | `standard:check`, `test:trust`, `economics:check` pass; DNS row may be stale vs live 200 |
| **Monetization code** | Shipped | 30-day pilot end, 402 lock, BillingLockScreen |
| **Cash** | Empty | No Stripe keys in agent env · $0 collected · 0 subscriptions |
| **Design partners** | Thin | 3 pilots, none paying, baselines unset, proofs never copied |
| **Distribution** | Machine ready, pipeline empty | Admin cadence exists · waitlist count = 0 |
| **Legal** | Placeholder | `governingLawState` not set · counsel gate open |

**One-line verdict:** You have a shippable wedge product with hard paywalls in code — and zero revenue, zero sales pipeline, and unfinished founder cert.

---

## Roadmap (ordered — do not skip)

### Phase A — Prove the front door *(you are here)*

| Step | Done? | Notes |
|------|-------|-------|
| A1 Live shop line answers + books | ✅ | Summit exclusive +18446439170 |
| A2 `wedge:ready` 8/8 | ✅ | Production-grade for Summit |
| A3 Hard trial / lock (no free forever) | ✅ | Code on `main` |
| A4 Founder phone cert (5 scenarios from your cell) | ❌ | Settings checklist — **next human gate** |
| A5 Fill baseline + avg ticket on Summit | ❌ | Unlocks honest recovered $ |
| A6 Copy first weekly proof | ❌ | Stamps `lastWeeklyProofAt` |

**Exit A:** You can demo Summit live without flinching, and show one dated proof artifact.

### Phase B — Collect money *(blocked on Stripe)*

| Step | Done? | Notes |
|------|-------|-------|
| B1 `STRIPE_SECRET_KEY` + `npm run stripe:setup` | ❌ | 5 blockers in `billing:check` |
| B2 Webhook on api.orvius.im | ❌ | Needed for `active` status |
| B3 First Checkout → `billingStatus: active` | ❌ | **$1 of ARR > any feature** |
| B4 Convert or lock pilots at day 30 | ⏳ | Summit ends ~Sep 30 |

**Exit B:** Non-zero ARR. Product stops being a hobby.

### Phase C — 10 design partners with measured lift

| Step | Done? | Notes |
|------|-------|-------|
| C1 Outreach machine (Admin, 20 touches/day) | ✅ code / ❌ volume | Pipeline empty |
| C2 Sign pilots who set baseline | ❌ | 0/10 |
| C3 Weekly proof ritual per live shop | ❌ | |
| C4 Case notes (jobs recovered, not homepage claims) | ❌ | |

**Exit C:** 10 shops running; several with before/after numbers you can show privately.

### Phase D — Retention + expansion (OS rings)

| Step | Done? | Notes |
|------|-------|-------|
| D1 Customer history + money timeline + export | ✅ | Switching-cost foundation |
| D2 Daily use until leaving hurts | ❌ | Founder / partner habit |
| D3 Expand modules only after wedge undefeated | Rule | Do not lead with “AI OS” |

**Exit D:** Churn risk low; Pro/Fleet upgrades natural.

### Phase E — Institution

| Step | Done? | Notes |
|------|-------|-------|
| E1 Formation state confirmed with counsel | ❌ | |
| E2 DNS / webhook / ops permanently green | Partial | Site 200; treat DNS doc as verify-not-assume |
| E3 Hire / process around sales cadence | ❌ | After money + 10 partners |

**Exit E:** Company can raise or scale without legal/ops landmines.

---

## Right now — ordered actions (founder)

1. **Phone cert** — Settings → 5 scenarios from your cell (`docs/WEDGE-MASTERY.md`)
2. **Stripe** — paste keys → `npm run stripe:setup` → one paid Checkout
3. **Summit economics** — avg ticket + baselines → Copy weekly proof
4. **Pipeline** — load 20+ prospects; hit daily touch target
5. **Counsel** — formation state → update `company.ts`

Code is not the bottleneck anymore. Cash, cert, and cadence are.

---

*Source of truth also: `docs/MULTI-BILLION-BATTLES.md`, `docs/FAILURE-LOG.md`*
