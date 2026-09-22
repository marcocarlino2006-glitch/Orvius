# MULTI-B STRICT — no corners

This is the uncompromising checklist.

If an item is unchecked, **Orvius is not multi-b standard yet.**  
No soft language. No “almost.” No features instead of proof.  
Ambition to change lives at scale does not excuse cutting any of these.

Run the automated floors:

```bash
npm run beyond:check
npm run multi-b:check
npm run bulletproof
```

Green scripts are necessary. They are **not sufficient.** Founder gates below still count.

---

## 0. Operating laws (never negotiable)

- [ ] **Wedge sacred** — call → qualify → alert → inbox → book stays undefeated before any new ring
- [ ] **Nothing fails silent** — every alert attempt logged; failures visible to owner; queue drains
- [ ] **Owner language** — dashboard is for a shop owner at 6am, not engineers
- [ ] **Honest product** — every public claim is true in production today
- [ ] **Prove → confirm → claim** — never reverse that order
- [ ] **Fail closed** — unpaid → locked; unauth → 401; cron → secret required
- [ ] **No vanity green** — skipped CI gates stay red; founder work stays founder
- [ ] **Compounding only** — refuse work that does not deepen the record or the money rail
- [ ] **2am test** — would you bet your own shop’s night jobs on this loop?

---

## 1. Wedge mastery (the front door)

Without this, nothing else matters.

- [ ] Dedicated shop line provisioned (one number → one shop, exclusive)
- [ ] Line tested end-to-end with a completed real call
- [ ] Owner mobile ≠ shop line
- [ ] Owner alert delivered (SMS and/or email) under ~30–60s P95
- [ ] First real lead in inbox with notification
- [ ] Lead auto-books to dispatch
- [ ] Shop health clear (no critical)
- [ ] Founder phone certification: **5/5 live cell scenarios** stamped in Settings
  1. AC emergency after hours — name, phone, service, urgency, address
  2. “Can I talk to someone?” — callback offer + number captured
  3. Non-urgent estimate — correct urgency
  4. Hang-up mid-call — partial lead, no crash
  5. Inbound SMS — lead + auto-reply
- [ ] `npm run wedge:ready` **8/8** on the design-partner shop against **prod**
- [ ] No shared phone numbers across shops
- [ ] Overflow truth: prove line before confirm forward/publish
- [ ] Customer confirm loop live (proposed ≠ confirmed until customer taps)
- [ ] Failure log: **zero open blockers** on the wedge path
- [ ] You would put **your own shop** on Orvius tomorrow

---

## 2. Reliability & ops (reputation bar)

- [ ] Alert retry ladder advances without waiting a day (webhook drain and/or sub-rung cron)
- [ ] SMS exhaustion → email failover path live
- [ ] `RESEND_API_KEY` (or email provider) live in production
- [ ] Cron endpoints fail-closed without `CRON_SECRET`
- [ ] Tenant APIs return **401** without session (shop A never sees shop B)
- [ ] Auth allowlist fail-closed in production
- [ ] Public rate limits on exposed endpoints
- [ ] Health endpoint hygiene (no secret leakage)
- [ ] Observability: Sentry (or equivalent) DSN live for prod errors
- [ ] `npm run ops:check` / `standard:check` / `beyond:check` green before deploy
- [ ] Same-day fix culture: every miss logged in `docs/FAILURE-LOG.md`

---

## 3. Money (the lock that creates switching cost)

Record without money is leaveable over a weekend. Multi-b requires the rail.

### SaaS billing
- [ ] Stripe secret + Pro price ID + webhook secret live on production
- [ ] `npm run stripe:setup` completed
- [ ] Pilot ends (`pilotEndsAt`); free forever is dead
- [ ] Product APIs return **402** `billing_required` when not entitled
- [ ] Non-dismissible lock screen for expired / past_due
- [ ] First live Checkout completed → **first real $**
- [ ] No Subscribe / paid CTA until billing check is green
- [ ] Paid activation verified before self-serve shop line provision

### Shop money rail (OS lock)
- [ ] Estimates draft in-product
- [ ] Invoices draft in-product
- [ ] Card collection path live
- [ ] **Stripe Connect (or equivalent) payouts to the shop bank** live
- [ ] Collected $ only from recorded payments — never label pipeline as recovered
- [ ] Owner avg ticket + baselines set before claiming estimated value
- [ ] Weekly proof ritual stamped (not stale >7 days) with measured captured-demand bookings

---

## 4. Outcome honesty (before outcome pricing)

- [ ] Qualified calls captured — measured
- [ ] Jobs booked from Orvius-captured demand — measured
- [ ] Booking / response rates — measured
- [ ] Estimated $ only when owner supplied avg ticket
- [ ] Deposits / payments actually collected — measured separately from pipeline
- [ ] Exceptions requiring owner approval — visible
- [ ] Every agent action has status + evidence (audit trail)
- [ ] High-risk customer / schedule / money actions wait for approval until explicitly delegated
- [ ] Never hide an agent action after execute or dismiss
- [ ] Never reconstruct outcomes from separate CRM pages — one Command surface
- [ ] Outcome-based pricing only **after** measurement + reliability are proven

---

## 5. Craft & presence (brand-swap test)

- [ ] Category: night-shift OS for HVAC / plumbing / electrical — not “AI phone agent”
- [ ] First viewport fails brand-swap test (strip nav → still unmistakably Orvius)
- [ ] Live line is the demo (callable product artifact)
- [ ] Shop-floor language — bay / board / night rules — not CRM theater
- [ ] Homepage + `/demo` match live behavior (no fake locked appointments)
- [ ] No absolutist copy: never-miss / guaranteed / 100% / always-answers banned
- [ ] Marketing does not oversell OS ring depth not yet live
- [ ] CSS / visual system coherent — no landfill eras pretending to be craft
- [ ] `npm run master:class` green

---

## 6. Monopoly asset (why this compounds)

- [ ] Every lead write goes through `demand-capture`
- [ ] Job taxonomy append-only (never rename codes)
- [ ] ZIP / service-area parsed for local demand
- [ ] `firstContactedAt` / `closedAt` stamped from real status changes
- [ ] No benchmark dashboard until there is a real multi-shop market in the table
- [ ] Aggregate / k-anonymous only — never resell a shop’s book
- [ ] Sequence respected: per-shop mix → local benchmarks → underwriting → demand routing
- [ ] No marketplace (ring 8) until one metro has supply density

---

## 7. Distribution (proof at scale)

- [ ] Real prospect list (no seed / example emails as contacts)
- [ ] Admin pipeline stages: new → contacted → demoed → onboarded → live → closed
- [ ] Daily cadence: due today + overdue; target **20 touches / day**
- [ ] Design partners signed and running (path to **10 paying or proving shops**)
- [ ] One **external named proof** chapter (not Summit self-reference)
- [ ] Word-of-mouth quality: one owner would tell another without a discount bribe
- [ ] No blitz outbound to hide product gaps
- [ ] Failure log clean before scaling outreach volume

---

## 8. Legal, trust & company

- [ ] LLC / entity formation state confirmed with counsel → `formationStateConfirmed` set
- [ ] Terms, privacy, SMS program accurate to what ships
- [ ] Support commitment honest (best-effort until staffed — no fake SLA)
- [ ] No SOC2 / 99.99% / enterprise badges until earned
- [ ] Trademark / copyright notices accurate
- [ ] DNS + production deploy on orvius.im stable
- [ ] Production secrets only on Vercel (never committed)

---

## 9. OS expansion locks (only after 1–8)

Do **not** start these to feel busy. Earn them.

| Lock | Required before | Status rule |
|------|-----------------|-------------|
| **Record** (customers, jobs, dispatch) | Wedge 8/8 | Deepen, don’t replace front door |
| **Money rail** (card → Connect) | First paid SaaS $ + proving shops | Before any integration ring |
| **Plug** (Jobber / ST / QuickBooks) | Money rail live + paying shops asking | No APIs for imagined users |
| **Network / marketplace** | Supply density in one metro | Thin supply burns brand |

- [ ] Record lock solid on live shops
- [ ] Money rail complete (Connect payouts)
- [ ] Plug only when a paying shop asks for a specific integration
- [ ] Marketplace held until metro density

---

## 10. Team & cadence (how multi-b companies actually run)

- [ ] Daily: shop health + failed alerts reviewed
- [ ] Daily: `/admin/daily` outreach run when distributing
- [ ] Before every deploy: `ops:check` + trust tests + beyond-bar
- [ ] Before every design partner go-live: `wedge:ready` + billing state clear
- [ ] Before every public post: full `bulletproof` (no skip-cash if claiming paid)
- [ ] Weekly: proof stamp on each live shop
- [ ] Same-day fixes on blocker / high failures
- [ ] No “ship theater” — if it isn’t true in prod, it doesn’t ship in copy

---

## 11. Forbidden until earned (hard bans)

These are corner-cuts. They are not allowed:

- Claiming multi-b / institutional / “answers every call” / never-miss / guaranteed
- Fake case studies, invented ARR, vanity homepage metrics
- Self-serve Subscribe before Stripe is live
- “Card pay lands in shop bank” before Connect
- Jobber / ServiceTitan sync claims before built
- Benchmark / market data UI on one shop’s numbers
- Renaming taxonomy codes
- Soft-forever free pilot
- Vanity-green CI (counting skips as pass)
- Inventing formation state
- Expanding rings to avoid closing red gates
- Posting publicly with red Manus / bulletproof bar

---

## Definition of multi-b standard (pass / fail)

### Floor (code)
`npm run beyond:check` · `npm run multi-b:check` · `npm run bulletproof` all exit 0 with **no intentional red skips excused as done.**

### One shop
Wedge 8/8 · owner would dogfood tomorrow · weekly proof stamped · billing entitled or explicit pilot · failure log clear.

### Ten shops
First paid $ · external named proof · real outreach (not seeds) · 10 paying or proving partners · formation confirmed.

### Category OS
Money rail live · record undefeated · plugs only when pulled · monopoly capture compounding · brand-swap test held.

**Only when all four layers are true may we say Orvius is multi-b standard.**  
Until then: build, measure, certify — do not perform.

---

## Ordered close sequence (no skipping)

1. Live wedge cert (5 cell + `wedge:ready` 8/8 prod)  
2. Stripe live → first Checkout $  
3. Resend / email failover live  
4. Summit baselines + weekly proof current  
5. Real outreach list → 20/day cadence  
6. External named proof  
7. Formation state (counsel)  
8. 10 paying / proving shops  
9. Finish money rail (card → Connect)  
10. Then plugs / metro / rings  

More features before step 8 is a corner cut.

---

*Canonical strict list. Companion docs: `BEYOND-BAR.md`, `STANDARD.md`, `MULTI-BILLION-BATTLES.md`, `MONOPOLY.md`, `MANUS-BAR.md`, `WEDGE-MASTERY.md`, `ROADMAP.md`.*

Commands: `npm run life:check` · `npm run beyond:check` · `npm run multi-b:check` · `npm run bulletproof`
