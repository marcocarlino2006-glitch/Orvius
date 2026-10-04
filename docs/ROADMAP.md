# Orvius business roadmap — the road to multi-billion

Updated 2026-10-01. Stages end at gates, not dates: we move on when the numbers
are true on the weekly scoreboard (`/admin`, emailed every Monday). The work
itself lives in `docs/BACKLOG.md`; this file sets direction.

## The mission

**Give every small business in the world the front office of a Fortune 500
company.**

A big company has a call center, a booking team, follow-up staff and a billing
department. A plumber, a dentist or a salon owner has one phone and two hands.
Orvius closes that gap — for the roughly 33 million small businesses in the US
and the hundreds of millions worldwide.

The dream, in three steps, each earned by the one before it:

1. **The front desk for every business.** Orvius answers the phone for millions
   of businesses, in any industry and any language, day and night.
2. **The operating system for small business.** Once we hold the calls, we run
   what comes after them: scheduling, follow-ups, payments, reviews and the
   weekly numbers. The owner runs the business from their phone; Orvius runs
   the office.
3. **The network between customers and businesses.** When someone needs a
   plumber at 2 a.m. or a dentist tomorrow, they — or their AI assistant — book
   through Orvius, because we know who is open, who is nearby and who does good
   work.

The mission is the goal, not a claim about today. Public copy never says "never
miss" or "every call answered"; calls can still fail, and we say what is true.

## The bet

**Orvius is the AI front office for every business that runs on the phone.**
It answers every call and text, books the appointment, takes the deposit,
follows up, and collects the invoice, in the business's own name, for any
industry. Anyone can sign up tonight, and it works in minutes.

Horizontal, like Square and Shopify: one platform for everyone, with an
**industry pack** per kind of business (its intake questions, booking rules,
emergency rules and wording) so it never sounds generic. Home services is the
first pack, not the ceiling.

## Why this is big

- **Every business answers the phone.** The US has about 33 million small
  businesses; roughly 6 million have employees. Most miss calls every day, and
  every missed call is lost money.
- **It replaces a hire.** A front-desk person costs $35,000–50,000 a year and
  covers 40 hours a week. Orvius covers all 168, in any language.
- **The money moves through it.** Deposits, no-show fees, invoices and
  payments for every booking it makes. That is where Square and Toast earn most
  of their money.
- **AI assistants are starting to call businesses for people.** Orvius already
  serves AI callers (M8). If assistants book local services through Orvius,
  we're the front door of local business on both sides of the call.

## The math

| Revenue line | Per business per year | Where it comes from |
|---|---|---|
| Subscription | $2,400–9,000 | $199 entry up to front-office tiers priced against a hire |
| Payments | $2,000–10,000 | ~1% on deposits, invoices and payments booked through Orvius |
| Add-ons | $500–3,000 | Extra lines and locations, more agents, booked-job pricing |
| **Total** | **~$5,000–20,000** | |

| Businesses | Revenue at ~$5,000 each | At ~$10,000 each |
|---|---|---|
| 10,000 | $50M | $100M |
| 100,000 | $500M | $1B |
| 1,000,000 | $5B | $10B |

Square serves millions of sellers; Shopify millions of merchants. A million
businesses is the scale of a horizontal leader, and a multi-billion valuation
comes long before it.

## First-principles check (2026-10-02)

**The system's output is paying shops that stay.** Everything else is a
component. Walking the chain a shop goes through, in order:

| Step | What has to be true | Today |
|---|---|---|
| Hear it | A stranger hears Orvius answer as their business | Demo line answers as Summit HVAC; `/try` (as *your* business) is built but off until the Vapi server-URL switch |
| Sign up and pay | Self-serve signup, Stripe live | Done (prod:verify, 2026-09-30) |
| Go live | Line bought, forwarding set, one test call | Done; resumable; number now readable on the setup screen |
| The owner finds out | The booking text reaches the owner's phone | **Blocked by carriers until toll-free verification passes.** Email works. |
| Run the day | Command, jobs, dispatch, follow-up | Done enough to launch; owners can now book their own work and drag to reassign |
| It pays for itself | Price above unit cost at real usage | **Unknown until now.** Pricing was set against competitors, never against cost |

**The bottleneck is not the product.** Making a better dashboard raises a
component, not the output. Two links cap the whole chain: (1) the owner text,
a carrier rule we can't engineer around, only clear (S6); and (2) hearing it as
your own business (G5), which is one switch in Vapi. Until both are true, more
features don't create more paying shops.

**Do the math before trusting the price.** At list prices a call costs roughly
$0.25–0.90 (Vapi at ~$0.10–0.30/min plus the phone leg, 2–3 minute calls).
Line charges $0.66 per included call, and overage is $0.50. At the high end,
overage loses money on every call, and Line breaks even at its allowance. That
was a guess, so every call now stores Vapi's reported cost, and the Monday
board shows cost per call, overage margin, and each plan's margin if a shop
uses every included call (`src/lib/call-cost.ts`). The price changes when the
first 30 days of real calls say it should, not before.

**The first buildable move, in order:**

1. Clear the two blockers (toll-free verification, the Vapi switch). Founder,
   no code.
2. One real shop runs on Orvius for two weeks. Its numbers on the board are the
   story: calls, booked jobs, money collected, cost per call.
3. Record the raw launch video from that shop's real night (I1), then open
   channels.
4. Reprice from measured cost before scaling paid acquisition; money through the
   platform (deposits, invoices) is what funds Stage 2.

**What is known vs. hoped.** Known: the product answers, books, dispatches and
bills in code and in tests; production checks pass daily. Not yet known:
booking rate on real calls, cost per call, retention after two billing cycles,
and whether owners pay for the operating system or only the receptionist. The
stages below are a plan to test, not a forecast.

## Stage 1 — Launch for everyone

**Goal:** any business can sign up, hear Orvius answer as itself, and go live
the same night.

- **Signup asks the industry**, and the business gets the right pack:
  home services (HVAC, plumbing, electrical: built), plus a general pack that
  works well for any business out of the box.
- **Launch packs** for the busiest phone industries: auto repair, salons and
  spas, medical and dental offices (front desk only, no health records),
  law offices, real estate, cleaning, moving, pest control, roofing.
- **`/try` for any business:** type your business name and industry, call,
  hear Orvius answer as you, and get the booking text on your own phone.
- **The launch video** shows three businesses in a row answered as themselves
  (an HVAC shop at 11 PM, a salon, a law office), then "Try yours free."
- **Calendars people already use:** Google Calendar and Outlook first, then
  the industry tools (Jobber done, Square Appointments, Housecall Pro).

**Must be true first:** texts arrive (toll-free verification), the `/try`
demo number is live (the Vapi switch), and calls finish cleanly on every pack.

**Gate:** 100 paying businesses across at least 5 industries, none canceling
after two billing cycles. **~$300k a year.**

## Stage 2 — Grow on its own

**Goal:** businesses arrive without us.

- **The signup data picks the next pack.** Whichever industries sign up most
  get a dedicated pack next; nothing is guessed.
- **Referrals:** "Answered by Orvius" on booking texts and a referral link in
  every owner's weekly report.
- **Content:** real calls (with permission) on TikTok, Reels and YouTube, one
  industry at a time.
- **Partners with millions of small businesses:** website builders, booking
  tools, payment processors, phone carriers and accountants that resell or
  bundle it.
- **App stores:** Google Workspace, Square, Shopify, HubSpot marketplaces.

**Gate:** 10,000 paying businesses · monthly cancellations under 3% · 1 in 5
new businesses from referrals or partners. **~$50M a year.**

## Stage 3 — The money

**Goal:** Orvius is where the customer pays.

- A deposit or payment link on every booking; no-show fees; invoices; payouts
  the same day.
- Front-office tiers for bigger businesses, priced against a hire.
- Multi-location and franchise accounts: dental groups, salon chains, the
  investment firms rolling up HVAC shops.

**Gate:** 100,000 businesses · most bookings paid through Orvius · businesses
spend more each year than the last. **$500M–1B a year.**

## Stage 4 — The front office for every business

**Goal:** every office job is done by Orvius agents.

- Calls, texts, email and web chat; scheduling; reminders; quotes; invoices;
  collections; reviews; memberships; the morning brief.
- **AI assistants book through Orvius:** a public booking interface (MCP and
  API) so ChatGPT, Siri, Gemini and Meta's assistants can book any Orvius
  business directly.
- Other countries and languages.

**Gate:** 1,000,000 businesses. **$5B+ a year.**

## Why we win

1. **Industry packs on one platform.** Generic receptionists sound generic;
   vertical tools only serve one industry. We're both: one platform, and it
   knows each business's calls.
2. **Self-serve in minutes.** No sales call, no contract, live tonight.
3. **It demos itself.** Nobody else lets a business hear itself answered
   before paying.
4. **The money.** Once payments land through Orvius, leaving means changing
   how the business gets paid.
5. **Every call makes it better.** Failed calls become test scenarios for
   the voice simulator.

## What would kill us

| Risk | What we do about it |
|---|---|
| Sounding generic and getting compared on price alone | Industry packs, and `/try` so people hear the difference |
| A botched emergency call (gas, flooding, medical) | Emergency rules in every pack, tested on every change; send to a human when unsure |
| Texts blocked by carriers | Toll-free verification now; 10DLC and dedicated numbers as volume grows |
| Big platforms (Google, Square) building their own | Be faster and better on calls; partner with them where they'd rather bundle than build |
| Regulated industries (medical, legal) | Front desk only: book and route, never give medical or legal advice, no health records |
| Voice AI cost per call | Every call stores Vapi's reported cost; the Monday board shows cost per call and plan margins. Switch the most expensive stage's model first |
| Overclaiming | The site claims only what is live; every claim is checked against production before a post |

## Rules

- One list of work (`docs/BACKLOG.md`); this file only sets direction.
- Reliability before features. A business's customers never feel our bugs.
- A pack is sold only after its calls pass the voice simulator.
- The scoreboard decides what's next: every Monday, the weakest number gets the week.
