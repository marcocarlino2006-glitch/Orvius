# What multi-b AI + trades platforms actually need to win

Research synthesis for an Orvius-class company (AI receptionist → home-services OS).  
Sources: public filings, company blogs, Sacra, Toast Investor Day, contractor forums, FSM market reports (2024–2026).  
Valuations are financing marks, not proof of durability — patterns below are the useful part.

---

## 1) Category leaders / comps — what they actually sell

| Comp | Scale signal | What customers buy | Playbook Orvius should steal | Trap to avoid |
| --- | --- | --- | --- | --- |
| **ServiceTitan** | ~$772M FY25 revenue; ~9,500 customers; $68.5B GTV; NDR >110%; GDR >95% | End-to-end trades OS: CRM, dispatch, job costing, marketing, payments on the job | Own the **job** as system of record; monetize SaaS + GTV; expand via marketplace/apps | Trying to rip-replace them day one; they win mid/large shops with deep ops, not overflow phone |
| **Housecall Pro** | ~$200M est. revenue; high HVAC FSM share by *customer count* (~39% in one 2025 HVAC FSM sample) | Mobile-first SMB FSM: schedule, invoice, pay, reviews, financing | Land owner-operators (1–30 employees); simplicity + payments + reviews | Feature parity race with ST; HCP wins on ease, not enterprise depth |
| **Jobber** | ~$100–180M est. revenue band (private estimates vary) | Scheduling/CRM/invoicing for home services long-tail | Clean CRM + batch invoicing + integrations; lower ACV self-serve | Competing as “another FSM” without a sharper money outcome |
| **Angi / HomeAdvisor** | Massive consumer demand; contractor trust badly damaged (FTC $72M settlement; widespread shared-lead / billing complaints) | Pay-per-lead marketplace (~$15–$85+/lead; contractors often report ~$60–$130 realized) | Consumer demand matters — but **exclusive, answered demand** beats shared leads | Building a lead marketplace before owning call→cash for shops |
| **Smith.ai** | Hybrid AI + live NA agents; ~$1.60–$10/call by tier | Answer → qualify → book consult → CRM writeback; human escalation | Outcome = booked consult / captured intake, not minutes talked; hybrid trust | Pure human answering margins don’t scale to multi-b software multiples |
| **AnswerConnect** | Human-only answering; ~$350+/mo starting | Always-person brand for skeptical SMBs | Trust positioning; scripted triage | “Always people” is a service business, not a data/GTV platform |
| **Dialpad AI** | UCaaS + bundled transcription/assist | Phone system upgrade with AI assist | Bundle voice infra + AI if you own the line | Mid-market communications ≠ vertical receptionist outcomes |
| **Cresta** | ~$1.6B reported valuation; $125M Series D (2024); Fortune 500 CCaaS overlay | Agent Assist + autonomous agents + conversation intelligence; ISO 42001 / SOC2 / HIPAA posture | Guardrails, testing before deploy, continuous QA, audited escalations | Enterprise six-figure ACV motion doesn’t fit 3-truck HVAC shops |
| **Sierra** | $10B+ → later rounds reported higher; voice overtaking text | Productized agents that **execute** (refunds, payments, CRM actions); outcome pricing | Price against completed outcomes; agents that act in systems of record | Horizontal enterprise CX is a different buyer than a trades owner at 6am |
| **Intercom Fin** | Outcome pricing ~$0.99/outcome; ~76% reported resolution rate; Salesforce deal ~$3.6B reported | Pay only when AI resolves / completes configured procedure | Align price to measurable outcomes; don’t bill failed escalations | Chat helpdesk resolution ≠ emergency HVAC booking |
| **Retell / Vapi** | Infra/API layer (Vapi ~$500M mark reported; Retell managed pipeline ~$0.07+/min class) | STT→LLM→TTS orchestration, telephony, tool calls | Buy infra; own vertical workflow, data, and outcomes | Shipping a thin wrapper on Retell/Vapi with no FSM depth or shop ROI |
| **Toast** | Dense local share → “flywheel” markets (~20–30%+ SMB share); ~75% inbound / ~20% referral in mature markets; fintech on GPV | POS wedge → payments → payroll/capital | **Geographic density**, field sales, payments attach, land-and-expand ARPU | National spray-and-pray before one city trusts you |
| **Shopify** | Merchant Solutions (payments/capital/balance) majority of revenue; default Payments attach | Store OS → payments default → lending/banking → app ecosystem | Embedded finance after workflow ownership; marketplace after density | Building marketplace/app store before core job is undefeated |

### Segment map (who owns whom)

```text
Consumer demand          Angi / Thumbtack / Google LSA     (hostile economics for shops)
Front door (phone)       Smith.ai / AnswerConnect / AI voice startups / Orvius wedge
Ops system of record     ServiceTitan (mid+) · HCP/Jobber (SMB)
Talk / UCaaS             Dialpad / RingCentral / etc.
Enterprise CX agents     Sierra / Cresta / Fin
Voice plumbing           Retell / Vapi / Twilio
Payments / OS expand     Toast / Shopify playbook on top of SoR
```

Orvius wins by owning the **front door** so hard that the SoR integrations and later money rails become inevitable — not by out-FSMing ServiceTitan in year one.

---

## 2) Hard requirements for multi-b (concrete, not slogans)

### Distribution
- **Local density before national vanity.** Toast treats ~20–30% share in an MSA as “flywheel”; referrals and inbound then dominate. Pick metros / trade niches and saturate.
- **Proof assets that close:** recorded calls, weekly recovered-jobs proof, named design partners, peer referrals from owners (not influencers).
- **Sales motion matches ACV:** 1–10 truck shops = founder/field + product-led pilot; 20+ truck / ST shops = partner/integration + ROI spreadsheet vs CSR overtime.
- **Integration as distribution:** HCP + ServiceTitan cover ~73% of HVAC companies *already on FSM* in one 2025 sample — partner/embed where they live.

### Density
- Same trade + same metro compounds: shared scripts, emergency pricing norms, seasonal load patterns, referral chains between owners.
- Density also improves model quality (call taxonomy, address parsing, urgency) and support SOP reuse.

### Unit economics
- Track **cost per booked job** and **incremental job margin captured**, not cost per minute.
- Benchmark reality: missed/after-hours leaks often modeled at **tens of thousands $/year** for small shops; emergency tickets often **$300–$850+**; lead CAC in paid channels often **$35–$95**.
- Path to multi-b ARPU: SaaS/pilot fee → usage/outcome fee → **payments take rate on GTV** → financing/memberships later (ST/Toast/Shopify stack).
- Embedded finance in vertical SaaS can add **~$35–$75 net / customer / month** at scale when payment volume is high relative to software fee (public patterns from Toast/ST-class platforms).

### Trust / compliance
- Recording + AI disclosure on first seconds of call.
- Never claim to be human when asked (Smith.ai-class honesty).
- Outbound/SMS: consent logs, DNC scrub, local calling windows, A2P 10DLC, opt-out.
- PCI scope if taking deposits/cards; SOC 2 path before mid-market ST shops; audit trail of every agent action.
- Licensing/insurance are **shop problems** Orvius should not fake — but product can remind (COI expiry, license renewal) later.

### Reliability SLOs (owner-grade)
Owners bet night emergencies on this. Minimum bar:
- **Inbound answer:** first ring / <2s connect aspiration; no silent fail to voicemail without logged reason.
- **Owner alert:** SMS/email P95 under **30–60s** after qualified capture.
- **Booking integrity:** atomic slot lock; idempotent writes to FSM (ServiceTitan-style `idempotencyToken`); zero double-books.
- **Escalation:** warm handoff or guaranteed callback with full context; never dead-end on emergency.
- **Uptime during peak season** (summer HVAC / freeze plumbing) treated as revenue-critical, not best-effort.

### Multi-tenant
- One number → one shop exclusive; no shared lines.
- Tenant isolation for transcripts, PII, calendars, payment credentials.
- Per-shop scripts: service area, job types, emergency rates, after-hours rules, escalation contacts.

### Sales motion
- Land: overflow / after-hours / missed-call recovery (lowest change management).
- Expand: business-hours backup → estimate follow-up → deposits → membership renewals.
- Price: pilot with measured baseline → outcome or usage aligned to booked/qualified jobs → platform fee when SoR depth lands.
- Do **not** sell “AI OS” before wedge ROI is stamped weekly.

### Support
- Trades support is nights/weekends — same hours as the product’s value.
- Configuration help (service area polygons, job types, ST pairing) is onboarding, not a ticket afterthought.
- Failure visibility: owner sees dropped alerts, failed bookings, transfer misses.

### Data moat
Proprietary structured events beat model weights:
`call → intent/urgency → address → booking → dispatch → completion → payment → review`
- Retention of transcripts + outcomes enables better triage, fraud/no-show prediction, and underwriting later.
- Export must exist (trust) but daily dependence should hurt (switching cost).

### Payments
- Deposits at booking ($79–$99 class trip fees show up repeatedly as no-show killers).
- Collect on completion; card-on-file; financing attach for replacements.
- Payments are the Toast/Shopify/ST monetization engine — **after** the demand wedge is trusted.

### Marketplace
- Only after density: tech staffing, parts, insurance, financing, marketing services.
- Premature marketplace = Angi-shaped trust destruction.
- ST-style app marketplace works when you already sit on the job record.

---

## 3) Real SMB owner problems in trades

| Pain | Owner reality | Product implication |
| --- | --- | --- |
| **After-hours / missed calls** | Small shops miss large share of nights/weekends; voicemail conversion ~negligible; emergency tickets 2–3× daytime; annual leakage often modeled **$40k–$167k+** depending on volume | 24/7 answer + emergency triage + book or escalate same night |
| **No-shows** | ~5–15% typical; each burn ~$300–$600 truck time; free estimates no-show worse (~18–22%) | Confirm SMS, on-the-way texts, deposits for new customers, easy reschedule |
| **Estimates** | Bids go cold without follow-up; tire-kickers eat capacity | Capture intent on call; estimate pipeline + timed follow-ups; optional paid estimate visits |
| **Deposits / cash flow** | Materials and payroll precede payment; retainage/late pay crush working capital | Deposit at book; invoice on complete; card-on-file; later capital against GTV |
| **Tech dispatch** | Wrong tech / drive time / skill mismatch = callbacks and overtime | Only after calendar truth exists; skill + geo + overtime rules |
| **Reviews** | Google rating = demand; asking inconsistently | Post-job review ask automation (after completion proof) |
| **Licensing / insurance / tax** | State license, GL, workers’ comp, commercial auto, bonds, quarterly estimates, sales tax | Ops reminders / document vault later — not wedge day one |
| **Lead gen rot** | Angi-class shared leads, tire-kickers, hard-to-cancel contracts | Position as **defending owned phone demand**, not buying more junk leads |
| **Tool sprawl** | Phone + whiteboard + QuickBooks + FSM + marketing | Integrate with SoR first; replace later only where Orvius is system of record |

---

## 4) AI receptionist must-nail vs OS expansion theater

### Must nail (receptionist = product)

1. **Answer every inbound** on the exclusive shop line (overflow + after-hours first).
2. **Qualify:** trade match, service area, emergency vs schedule vs estimate.
3. **Capture:** name, phone, address, problem, urgency — structured, not a novel transcript.
4. **Act:** propose bookable slots against real capacity; write job/lead to inbox or FSM; send customer confirmation; alert owner/dispatcher.
5. **Escalate cleanly:** “talk to a person,” complex diagnosis, angry caller, out-of-area — with context preserved.
6. **Prove money:** weekly stamp of calls recovered → jobs booked → completed → collected (label estimates honestly).
7. **Fail loud:** alert delivery failures, booking conflicts, transfer misses visible and retriable.
8. **Sound like the shop:** hours, rates policy, brand voice, “we’re AI / recording” disclosure without killing conversion.

### OS expansion theater (defer until wedge pays repeatedly)

- Full tech mobile OS, inventory, flat-rate books, payroll, supplier catalogs.
- Rip-replace ServiceTitan / HCP as day-one pitch.
- Horizontal “AI agent platform for any SMB.”
- Consumer marketplace / lead auction.
- Fancy coaching analytics before booking integrity.
- Outcome pricing marketing before measurement integrity.
- Multi-trade / multi-country before one metro HVAC density.

**Rule:** if a feature does not increase answered→booked→paid conversion or locking switching cost on that path, it is theater.

---

## 5) Prioritized checklist — Orvius-class multi-b

Tags: **MUST-NOW** (wedge undefeated + paid proof) · **NEXT** (expand attach after 10+ live shops / density) · **LATER** (platform / multi-b ceiling).

### A. Front-door outcomes

| # | Capability / outcome | Tag |
| --- | ---: | --- |
| A1 | Exclusive DID per shop; owner mobile ≠ shop line | MUST-NOW |
| A2 | 24/7 inbound AI answer with recording + AI disclosure | MUST-NOW |
| A3 | Extract name, callback, address, problem, urgency, customer type | MUST-NOW |
| A4 | Service-area gate (don’t book jobs you won’t run) | MUST-NOW |
| A5 | Book or propose appointment; customer confirm loop (proposed ≠ confirmed) | MUST-NOW |
| A6 | Owner/dispatcher alert <60s P95 with deep link to lead | MUST-NOW |
| A7 | Human escalate / warm transfer / guaranteed callback path | MUST-NOW |
| A8 | Partial-lead capture on hang-up; no silent crash | MUST-NOW |
| A9 | Missed-call / busy / transfer-miss recovery into inbox | MUST-NOW |
| A10 | Weekly proof: baseline missed → Orvius booked → owner-confirmed recovered jobs | MUST-NOW |
| A11 | Business-hours overflow when CSR busy (same quality bar) | NEXT |
| A12 | Outbound missed-call callbacks + estimate follow-up sequences (TCPA-clean) | NEXT |
| A13 | Membership / maintenance renewal calling | LATER |

### B. Reliability, trust, tenancy

| # | Capability / outcome | Tag |
| --- | ---: | --- |
| B1 | Multi-tenant isolation; no shared numbers or calendars | MUST-NOW |
| B2 | Idempotent booking; double-book impossible under concurrency | MUST-NOW |
| B3 | Every agent action audited (status, evidence, timestamp) | MUST-NOW |
| B4 | Fail-loud ops: alert/book/transfer failures queued and visible | MUST-NOW |
| B5 | Peak-season capacity plan (concurrency, provider failover) | MUST-NOW |
| B6 | Honest claims only (no “never miss / 100% / guaranteed”) | MUST-NOW |
| B7 | SMS A2P, consent, opt-out, DNC for any outbound | NEXT |
| B8 | SOC 2 Type II path; DPIA/privacy docs for mid-market | NEXT |
| B9 | PCI-compliant deposit/card flows | NEXT |
| B10 | ISO-style AI management / enterprise procurement pack | LATER |

### C. System of record & integrations

| # | Capability / outcome | Tag |
| --- | ---: | --- |
| C1 | Orvius inbox as SoR for Orvius-originated demand (even without FSM) | MUST-NOW |
| C2 | Calendar/capacity truth for the pilot shop (native or synced) | MUST-NOW |
| C3 | Native or partner write into **Housecall Pro** and/or **ServiceTitan** (job + customer + notes) | NEXT |
| C4 | Jobber / Workiz / FieldEdge as demand warrants | NEXT |
| C5 | Two-way sync: cancel/reschedule from FSM reflected in Orvius | NEXT |
| C6 | QuickBooks / accounting push of invoices | LATER |
| C7 | Parts / flat-rate / equipment history OS modules | LATER |

### D. Money rails

| # | Capability / outcome | Tag |
| --- | ---: | --- |
| D1 | Track estimated ticket vs booked vs completed vs **collected** (never conflate) | MUST-NOW |
| D2 | Hard monetization: pilot clock, billing lock, paid Checkout | MUST-NOW |
| D3 | Collect deposit at booking (trip fee / new-customer deposit) | NEXT |
| D4 | Pay-on-completion / card-on-file via embedded payments | NEXT |
| D5 | Outcome-aligned pricing (per booked qualified job / recovered job) once measurement trusted | NEXT |
| D6 | Financing attach for replacements; working-capital against GTV | LATER |
| D7 | Payroll / banking / full fintech suite | LATER |

### E. Distribution & GTM

| # | Capability / outcome | Tag |
| --- | ---: | --- |
| E1 | One paying HVAC design partner with stamped weekly ROI | MUST-NOW |
| E2 | Founder certification: live cell scenarios pass on prod | MUST-NOW |
| E3 | Prospect pipeline + daily outreach cadence; peer referral ask | MUST-NOW |
| E4 | Pick **one metro** and stack 10–25 HVAC logos before national spray | NEXT |
| E5 | Trade-assoc / distributor / private-equity roll-up partnerships | NEXT |
| E6 | Field sales / local density playbook (Toast-style flywheel metrics) | NEXT |
| E7 | App marketplace / third-party ecosystem | LATER |
| E8 | Consumer demand marketplace (Angi-shaped) | LATER — only if exclusive + trusted |

### F. Owner operations beyond the phone

| # | Capability / outcome | Tag |
| --- | ---: | --- |
| F1 | Confirmations + reminders that cut no-shows | NEXT |
| F2 | Review request after completed paid job | NEXT |
| F3 | Estimate pipeline + dormant-bid follow-up | NEXT |
| F4 | Basic dispatch assist (skill/geo) on top of real calendar | NEXT |
| F5 | License / COI / workers’ comp expiry reminders | LATER |
| F6 | Tax reserve nudges / bookkeeping automation | LATER |
| F7 | Tech mobile workflow, inventory, route optimization as full OS | LATER |

### G. Data moat

| # | Capability / outcome | Tag |
| --- | ---: | --- |
| G1 | Structured event schema on every call (not only audio) | MUST-NOW |
| G2 | Customer timeline: calls ↔ jobs ↔ money in one place | MUST-NOW |
| G3 | Full data export (trust) + retention policy | MUST-NOW |
| G4 | Shop-level conversion benchmarks vs anonymized metro peers | NEXT |
| G5 | No-show / emergency demand prediction; underwriting features | LATER |

---

## 6) One-page verdict

**Multi-b trades platforms win by owning a high-frequency money workflow, densifying locally, attaching payments to GTV, and expanding only after retention is brutal.**  
ServiceTitan/HCP own the job OS; Angi owns (and often burns) consumer demand; Sierra/Fin/Cresta show outcome pricing and governed agents; Toast/Shopify show density + embedded finance; Retell/Vapi are plumbing.

**Orvius-class path:** undefeated **call → qualified demand → booked job → paid job** on HVAC overflow/after-hours, with owner-grade SLOs and honest economics — then HCP/ST writeback, deposits/payments, metro density, then OS modules. Anything that skips the wedge for “AI OS” theater is a competitor to your own future, not a shortcut to it.

---

*Compiled from public web research, 2026-09-23. Revisit numbers on each major ST/Toast/Sierra earnings or funding print.*
