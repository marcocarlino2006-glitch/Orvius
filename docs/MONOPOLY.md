# What actually becomes a monopoly

Companion to `docs/ROADMAP.md`, which tracks what is shipped. This one argues
about what is worth shipping, and in which order. It is deliberately short on
features and long on why.

---

## The one asset nobody else can assemble

Orvius answers the phone. That sounds like a feature and is actually a
position: the call is the moment demand is created, before it becomes a job,
an invoice, or a review. Everyone else in this market arrives later.

| Who | What they hold | What they never see |
|-----|----------------|---------------------|
| ServiceTitan, Housecall Pro | Jobs after the shop books them | The calls that never became jobs |
| Angi, Thumbtack | Leads they sold | What the job cost or whether it closed |
| QuickBooks | The invoice | Who called and what they wanted |
| Orvius | The call, the job, and the price | — |

Holding all three for one shop is a good product. Holding all three for ten
thousand shops is something no single shop and no competitor can reconstruct:
what a job type actually costs in a metro, which response times win work, and
when demand spikes.

A shop cannot compute that — it has one shop's worth of data. ServiceTitan
cannot compute the top row, because the calls that never converted never
reached it. This is the only asset here that grows with every customer and
cannot be bought.

## Why the ladder is ordered this way

Three moats, and they must be climbed in order, because each one funds the next.

1. **Switching cost — money rails.** A record-keeper can be left over a
   weekend. The rail a shop's deposits land on cannot. Ring 5 drafts estimates
   and invoices today; card rails and Connect payouts are the actual OS moment.
2. **Data — cross-shop demand intelligence.** Only worth something once there
   are shops, but only *possible* if capture started before them. See below.
3. **Network — homeowner marketplace.** The strongest and the last. Ring 8
   needs supply density in one metro first; a marketplace with thin supply
   sends homeowners to nobody and spends brand it took years to earn.

Skipping to 3 is the classic way to die here. Doing 1 without 2 builds a good
business with no compounding advantage.

## Why capture could not wait for revenue

Everything else on the roadmap can be built later at the same cost. This
cannot, because **there is no re-running last winter's phone traffic.**

Until now every call wrote its request as free text: "AC not cooling", "ac is
out", "air conditioner not working", "blowing warm air" — four rows, one job,
zero ability to count them together. At one shop that is untidy. At a thousand
shops it means the single defensible asset was being discarded on every call,
for free, forever.

So the capture layer landed now:

- `src/lib/job-taxonomy.ts` — 26 canonical codes. Append-only; renaming one
  splits its own history in half.
- `src/lib/service-area.ts` — ZIP parsed out of spoken addresses, the coarsest
  unit that is still local.
- `src/lib/demand-capture.ts` — the single path every write goes through, with
  a `standard:check` guard that fails the build if a lead is ever written
  without it.
- `Lead.firstContactedAt` / `closedAt` — stamped from status changes, so
  speed-to-lead against win rate stays answerable without asking an owner to
  log anything.

Cost to the shop: nothing. No new screen, no extra field, no clicks. It rides
on calls that already happen.

## What this unlocks, in order

Each step is worth money on its own and sets up the next.

1. **Per-shop mix.** "Half your calls this month were water heaters." One
   shop's own data, useful the day it has traffic.
2. **Local price benchmarks.** What a category actually closes at in a ZIP.
   This is the first thing a shop cannot get anywhere else, and the first
   reason to stay that isn't switching cost.
3. **Underwriting.** A shop's real forward book — booked work, category mix,
   close rate — is visible here before any bank sees it. Financing against
   revenue the platform can observe is how Shopify and Toast turned software
   ARPU into something much larger.
4. **Demand routing.** Knowing which shop has capacity for a category in a ZIP
   right now is the marketplace, and by then supply density is a byproduct
   rather than a cold start.

## What was deliberately not built

The point of naming the asset is to stop building around it.

- **No benchmark dashboard.** With zero paying shops it would display a chart
  of one shop's own numbers dressed up as market data. Build it when there is a
  market in the table.
- **No lost-reason picker.** Genuinely valuable and the only way to learn *why*
  work is lost, but it costs owner attention, and attention is the one budget
  a shop will not extend to software it is still evaluating.
- **No new rings.** Ring 7 stays closed until a paying shop asks for a specific
  integration. An API designed for imagined users fits none of them.

## What would kill this

- **Widening before the red gates close.** Cert, Stripe, and ten paying shops
  gate everything. No amount of schema prints ARR.
- **Renaming taxonomy codes.** Guarded in `standard:check`, because the damage
  is silent and only visible years later.
- **Selling the data back as the product.** Shops will accept benchmarks drawn
  from an anonymous pool that they contribute to. They will leave over anything
  that reads as their book being resold. Aggregate only, k-anonymous, and never
  per-shop.
- **Believing the moat is the API.** It is the money rail and the record.

---

*See also: `docs/ROADMAP.md` for the honest scoreboard,
`docs/MULTI-BILLION-BATTLES.md` for the staged plan.*
