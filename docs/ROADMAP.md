# Orvius business roadmap — the road to multi-billion

Updated 2026-09-30. Stages end at gates, not dates: we move to the next stage
when its numbers are true on the weekly scoreboard (`/admin`, emailed every
Monday), not when a calendar says so. The work itself lives in
`docs/BACKLOG.md`; this file says where the work is going and why.

## The destination

**Orvius runs the office for every home-service business in America.** Every
call, text, booking, dispatch, quote, invoice, payment and follow-up is handled
by Orvius agents, so a shop never needs to hire an office person again, and
Orvius earns a share of every dollar that moves through it.

**Today we are the AI receptionist for home-service trades** (HVAC, plumbing,
electrical). We say only that in public until more is live. Each new agent is
claimed on the site the day it works, not before.

## The math

| Revenue line | Per shop per year | Where it comes from |
|---|---|---|
| Subscription | ~$4,000 | Line $199, Pro $399, Fleet $749 a month, plus overage past the included calls |
| Payments | ~$10,000 | 1% platform fee (`ORVIUS_PLATFORM_FEE_BPS`, default 100) on deposits and invoices, on a shop taking ~$1M a year from customers |
| Add-ons | $1,000–5,000 | Extra lines, financing referral share, memberships, more agents |
| **Total** | **~$15,000+** | |

At 100,000 shops, that's **$1.5B+ a year in revenue**. ServiceTitan does
$961M from ~10,800 larger customers; Toast earns ~0.6% on $51B of payments a
quarter. Subscription alone never gets there: 100,000 shops × $4,000 is $400M.
**The money through the platform is the business.**

A multi-billion *valuation* comes earlier. Avoca reached $1B with 800+
customers because the market pays for fast growth in this category.

## Stage 1 — Proof: 1 to 10 shops

**Goal:** a receptionist shops can't live without.

- One real shop runs on Orvius for two weeks, found by hand. We fix everything
  it hits the same day.
- `/try`, the "hear your shop" demo, is the main thing on the homepage. An
  owner types their shop name, calls and hears Orvius answer as their shop,
  and their own phone gets the job text.
- The launch video is that demo on camera: an 11 PM emergency, Spanish, a gas
  smell, the booked slot, the owner's phone buzzing.
- Owner's phone-first view; the first-night screen; claims on the site match
  what's live.

**Must be true first:** toll-free verification approved (texts arrive), and
the Vapi demo number in server-URL mode.

**Gate to Stage 2:** 10 paying shops · none cancel after two billing cycles ·
calls finished cleanly ≥ 99% · each shop can name jobs it would have lost.
**~$50k a year.**

## Stage 2 — Repeatable: 10 to 1,000 shops

**Goal:** shops arrive without the founder in the room.

- **Self-serve in minutes:** sign up with email and password, forward the
  line, live the same night. No sales call, no contract. Already built.
- **Referrals:** a referral link in every owner's weekly report; one month
  free for both shops.
- **Content where owners are:** HVAC, plumbing and electrical Facebook groups,
  r/HVAC, TikTok and Reels, with real calls (with permission) and real shop
  numbers.
- **Integrations for shops that already have a system:** Jobber (done), then
  Housecall Pro, then QuickBooks.
- **More agents, one at a time:** follow-up (done), unpaid-invoice chasing,
  review requests.
- **Next trades:** roofing, garage doors, locksmiths, appliance repair, pest
  control. Each gets its own questions and safety rules before it's sold.

**Gate to Stage 3:** 1,000 paying shops · monthly cancellations under 3% ·
median signup to first booked job under one day · 1 in 5 new shops from
referrals · a shop pays back what it cost to win it within 6 months.
**~$5M a year.**

## Stage 3 — The money: 1,000 to 10,000 shops

**Goal:** Orvius is where the shop gets paid.

- Every booked job ends in an Orvius deposit or invoice link. Same-day payouts
  to the shop.
- Financing offered at the customer's kitchen table for big installs and
  replacements.
- Maintenance memberships: Orvius signs customers up, bills them and books
  their tune-ups.
- **ServiceTitan marketplace** and multi-location support, for bigger shops
  and the investment firms buying up HVAC companies.
- **Partners that bring thousands of shops at once:** equipment-brand dealer
  programs, supply houses, franchise groups, trade associations.
- Dispatch and quoting agents.

**Gate to Stage 4:** 10,000 shops · more than half of booked jobs paid through
Orvius · existing shops spend more each year than the last (net retention
above 110%). **~$100M+ a year.**

## Stage 4 — The office for the trades: 10,000 to 100,000 shops

**Goal:** the shop's whole front office is Orvius.

- Every office job done by agents: phones, texts, scheduling, dispatch,
  quotes, invoices, collections, reviews, memberships, the morning brief.
- Orvius is the shop's main system, not a layer on top of one.
- A public "missed-call index" built from our own data: how much work each
  trade loses to missed calls, city by city. Whoever owns that number owns the
  category.
- Every trade in home services.

**Gate:** 100,000 shops. **$1.5B+ a year.**

## Stage 5 — Beyond

- Homeowners book directly through the Orvius network; shops get jobs, not
  just calls.
- Canada, the UK and Australia.
- Lending to shops based on the payments we already see; insurance; parts
  purchasing.

## Why we win

1. **Trade depth.** Generic AI receptionists compete on price. We know which
   calls are emergencies, what each trade needs to ask, and what to do when a
   caller smells gas.
2. **Small shops, self-serve.** Avoca and ServiceTitan sell to big shops
   through sales teams. The 1–10 truck shop, which is most of the market, can
   start with us tonight for $199.
3. **Every call makes it better.** Failed calls become test scenarios for
   the voice simulator, so the product improves with volume.
4. **The money.** Once deposits land through Orvius, leaving means changing
   how the shop gets paid. That's what keeps ServiceTitan's customers above
   95% retention.

## What would kill us

| Risk | What we do about it |
|---|---|
| A missed or botched emergency call | Reliability before features; the safety rules are tested on every change; the daily production check |
| Texts blocked by carriers | Toll-free verification before launch; 10DLC or dedicated numbers as volume grows |
| A well-funded competitor moves down to small shops | Be faster, cheaper to start, and deeper in each trade; own the payments first |
| Voice AI costs per call | Reply latency is tracked per call; add cost per call, and switch models as prices fall |
| Overclaiming | The site claims only what is live; every claim is checked against production before a post |

## Rules

- One list of work (`docs/BACKLOG.md`); this file only sets direction.
- Reliability before features. A shop's customers never feel our bugs.
- Nothing is claimed publicly before it works.
- The scoreboard decides what's next: every Monday, the weakest number gets the week.
