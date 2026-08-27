# Orvius Roadmap

**Mission:** AI operating partner for service businesses — capture every opportunity, less friction, grow without overhead.

**Strategy:** Vertical first (home services) → wedge (AI receptionist) → retention → platform. Not “AI OS” on day one.

**Operating rule:** Master the software before you scale the story. Pilots amplify whatever quality you already have — good or bad.

**Domain:** orvius.im

---

## North star

| Horizon | Outcome |
|---------|---------|
| **Now** | Software we trust: every call/text handled cleanly |
| **Next** | Shops run on that software daily |
| **Later** | Category company: AI OS for service businesses |

---

## Phase 0 — Foundation (current)

**Status:** Scaffold exists; mastery does not.

| Item | State |
|------|--------|
| Thesis + wedge locked | Done |
| Next.js MVP (admin, dashboard, webhooks, pilot, demo) | Scaffold |
| Brand chromatics (Void / Chalk / Flare / Live) | Done — protect it |
| Marketing homepage | Direction set; craft unfinished |
| Twilio + Vapi credentials in env | Present — unverified end-to-end |
| Live receptionist on a real number | Not mastered |
| Product UX coherence (home ↔ app) | Incomplete |
| `orvius.im` DNS / GitHub / production | Blocked until software is trustworthy |

**Exit into Phase 1:** Founder commitment to mastery loop (build → dogfood → fix) before outreach volume.

---

## Phase 1 — Master the software ← NOW

**Goal:** Know every path in the wedge cold. No demos that rely on luck.

Mastery means: you can run the product yourself, break it on purpose, explain every failure, and fix it the same day.

### 1A — Core loop fluency

| Capability | Mastery bar |
|------------|-------------|
| Inbound voice | Answers in &lt;2 rings; natural; never dead-air loops |
| Qualification | Always gets service, urgency, address/callback when possible |
| Owner alert | SMS (and dashboard) within seconds; readable on a job site |
| Inbound SMS | Same qualify → alert path as voice |
| After-hours | Behavior correct when shop is closed |
| Failure modes | Bad audio, hangup mid-call, spam, callback request — handled |

**Drill:** 50 founder calls + 20 texts across happy path and edge cases. Log every miss in a running failure list. Zero repeats of the same miss.

### 1B — Product surfaces you can operate blindfolded

| Surface | Mastery bar |
|---------|-------------|
| `/admin` | Create/configure a business in &lt;10 min without notes |
| `/dashboard` | See calls, leads, status; trust the data |
| `/demo` | Predictable sales walkthrough that matches live behavior |
| `/pilot` | Honest promise that the product can keep |
| Onboard script | `npm run onboard` + webhook wiring is muscle memory |
| Health | `/api/health` and webhook status tell truth |

### 1C — Software quality bar (wedge only)

- Prompt pack: one excellent HVAC/plumbing/electrical receptionist (not generic)
- Idempotent webhooks; no duplicate leads on retries
- Clear lead model: new / urgent / callback / spam
- Owner notification never silent-fails without a visible error
- Local + staging environments that mirror production behavior
- Chromatics applied across marketing **and** product (one company)

### 1D — Founder certification (gate)

Before any pilot outreach sprint:

- [ ] Full E2E live call on a real number, recorded
- [ ] Full E2E SMS lead
- [ ] Admin setup from zero → live in one sitting
- [ ] Dashboard matches what just happened
- [ ] You can narrate the architecture in 5 minutes
- [ ] Known bugs list is empty of *blocker* severity

**Exit criteria:** You would put your own shop on Orvius tomorrow without hesitation.

---

## Phase 2 — Harden + ship the mastered wedge

**Goal:** Same software, reliable in production.

1. Deploy (Vercel or equivalent) with production secrets
2. Point `orvius.im` off Manus (see `docs/DNS-ORVIUS-IM.md`)
3. Connect GitHub; reproducible builds
4. Staging number + production number
5. Monitoring: failed webhooks, silent owner alerts, call errors
6. Run the Phase 1 drill again **on production**

**Exit criteria:** Production demo is as boringly reliable as local dogfood.

---

## Phase 3 — First 10 pilots (only after mastery)

**Goal:** Design partners on software you already trust.

1. Close **10** HVAC / plumbing / electrical shops (`docs/OUTREACH-PLAYBOOK.md`)
2. Setup *with* them; same checklist every time
3. Weekly pulse: capture rate, leads, owner reply time
4. Every pilot bug → same-day fix → back into mastery suite
5. 3 proof artifacts with numbers (“X jobs recovered”)

**Exit criteria:** ≥5 active shops through week 2; no trust-breaking incidents unfixed &gt;24h.

---

## Phase 4 — Retention product

**Goal:** Daily habit on top of a mastered wedge.

| Build | Why |
|-------|-----|
| Lead inbox owners actually open | Retention surface |
| Business-hours vs after-hours modes | Real ops |
| Booking / callback commit | Close the loop |
| Per-trade prompt packs | Quality at scale |
| Analytics: answered, leads, emergencies | ROI proof |

**Exit criteria:** Owners open Orvius unprompted; ≥60% of pilots want paid.

---

## Phase 5 — Paid → expand surface

**Goal:** Revenue, then widen only from usage.

1. Simple monthly per location
2. Convert pilots → paid
3. Missed-call text-back as tight as voice
4. Owner + dispatcher seats
5. Then: scheduling assist, follow-ups, daily brief — *from data*, not ambition

---

## Phase 6 — Platform (later)

Multi-location, job board of work, finance-lite only if retention demands it, new verticals only after home services is repeatable.

Do not sell “AI OS” until the wedge is mastered and retained.

---

## Near-term sequence (do in order)

```
1. Master the software (Phase 1 drills)   ← NOW
2. Harden + deploy + DNS (Phase 2)
3. 10 pilots on trusted product (Phase 3)
4. Retention surfaces (Phase 4)
5. Paid + expand from usage (Phase 5)
```

---

## Mastery weekly rhythm

| Day focus | Work |
|-----------|------|
| Build | One wedge gap (prompt, alert, admin, dashboard) |
| Break | Dogfood calls/texts; try to break it |
| Fix | Clear blocker list same day |
| Record | Update failure log + what “good” sounds like |
| Protect | No new features that dilute the wedge |

---

## What we will not do yet

- Pilot volume before founder certification (Phase 1D)
- Broad “any SMB” marketing
- Feature sprawl outside the receptionist loop
- Homepage redesign as a substitute for product mastery
- New color systems that break Chromatics

---

## Success metrics

| Stage | Metric |
|-------|--------|
| Phase 1 | Founder certification checklist complete |
| Phase 2 | Production E2E = local E2E |
| Phase 3 | 10 pilots; 5 active week 2 |
| Phase 4 | Pilot → paid intent ≥60% |
| Phase 5 | MRR + location retention |
| Phase 6 | Category earned by usage |

---

*Last updated: 2026-08-27 — mastery-first revision*
