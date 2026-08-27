# Orvius Roadmap

**Mission:** AI operating partner for service businesses — capture every opportunity, less friction, grow without overhead.

**Strategy:** Vertical first (home services) → wedge (AI receptionist) → retention → platform. Not “AI OS” on day one.

**Domain:** orvius.im

---

## North star

| Horizon | Outcome |
|---------|---------|
| **Now** | A shop never loses a job to a missed call/text |
| **Next** | Orvius is the daily operating layer for that shop |
| **Later** | Category company: AI OS for service businesses |

---

## Phase 0 — Foundation (current)

**Status:** In progress

| Item | State |
|------|--------|
| Thesis + wedge locked | Done |
| Next.js MVP (admin, dashboard, webhooks, pilot, demo) | Done |
| Brand chromatics (Void / Chalk / Flare / Live) | Done |
| Marketing homepage (direction set, not final craft) | ~30% of bar |
| Twilio + Vapi credentials in env | Present — must verify live |
| `orvius.im` DNS | Still on Manus — must move |
| GitHub remote + production deploy | Missing |
| Live receptionist on a real number | Not proven |
| Paying or pilot customers | Zero |

**Exit criteria:** One real inbound call is answered by Orvius, qualified, and owner-alerted end-to-end.

---

## Phase 1 — Live wedge (must complete next)

**Goal:** Working AI receptionist for home services.

1. Verify Twilio + Vapi: `npm run onboard`, inbound voice + SMS webhooks green
2. Deploy app (Vercel or equivalent) with production env
3. Point `orvius.im` off Manus → production (see `docs/DNS-ORVIUS-IM.md`)
4. Connect GitHub; CI build on main
5. Owner alert path: SMS (and optional email) with lead summary
6. Founder dogfood: call the number 20×; fix every failure

**Exit criteria:** You can demo a live number to a shop owner without apology.

---

## Phase 2 — First 10 pilots

**Goal:** Design partners, not vanity waitlist.

1. Close **10** HVAC / plumbing / electrical shops on 30-day free pilot (`docs/OUTREACH-PLAYBOOK.md`)
2. Setup done *with* them (number forward or Orvius line)
3. Weekly pulse: missed-call capture rate, leads created, owner reply time
4. Kill or fix anything that breaks trust in week one
5. Collect 3 written or recorded testimonials with numbers (“X jobs recovered”)

**Exit criteria:** ≥5 active shops completing week 2 with measurable captured leads.

---

## Phase 3 — Retention product

**Goal:** Become daily habit, not a gadget.

| Build | Why |
|-------|-----|
| Lead inbox that owners actually open | Retention surface |
| After-hours vs business-hours modes | Matches real ops |
| Simple booking / callback commit | Closes the loop |
| Per-trade prompt packs (HVAC, plumbing, electrical) | Quality + speed |
| Basic analytics: calls answered, leads, emergencies | Proof of ROI |

**Exit criteria:** Owners check Orvius without you nudging them; ≥60% of pilots want to continue paid.

---

## Phase 4 — Paid wedge → expansion

**Goal:** Revenue + expand the surface.

1. Pricing: simple monthly per location (start decisive; avoid custom chaos)
2. Convert pilots → paid
3. Add text-first / missed-call text-back as tightly as voice
4. Multi-user (owner + dispatcher)
5. Light CRM sync later (don’t boil the ocean)

**Then expand (only after wedge retention is real):**
- Scheduling / dispatch assist
- Follow-ups and review asks
- Parts / quote assist
- Full “operating partner” daily brief

**Exit criteria:** Consistent MRR from home-services wedge; clear next product bet from usage data.

---

## Phase 5 — Platform (later)

**Goal:** Category company — AI OS for service businesses.

- Multi-location / franchise
- Workforce + job board of work (jobs, techs, status)
- Finance-lite (invoices, deposits) only if retention demands it
- Adjacent verticals *after* home services playbook is repeatable

Do not advertise “AI OS” until the wedge is undeniable.

---

## Near-term sequence (do in order)

```
1. Prove live call loop          ← NOW
2. Deploy + DNS orvius.im
3. 10 pilot outreach sprint
4. Retention inbox + booking
5. Paid conversion
6. Expand surface from usage
```

---

## What we will not do yet

- Broad horizontal “any SMB” marketing
- Heavy CRM rebuild
- Image-heavy homepage sprawl without product proof
- New color experiments that break Chromatics
- Feature sprawl before 5 active pilots

---

## Success metrics

| Stage | Metric |
|-------|--------|
| Phase 1 | Live E2E call + owner alert |
| Phase 2 | 10 pilots signed; 5 active week 2 |
| Phase 3 | Pilot → paid intent ≥60% |
| Phase 4 | MRR + net retention of locations |
| Phase 5 | Category narrative earned by usage, not slides |

---

## Brand / product craft track (parallel, not blocking)

- Protect **Orvius Chromatics** (Void, Chalk, Flare, Live)
- Raise homepage + product UI to one coherent company
- Ship craft improvements *after* live number proof, using real call artifacts

---

*Last updated: 2026-08-27*
