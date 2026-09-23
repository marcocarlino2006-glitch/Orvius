/**
 * Beyond-bar — the ceiling Orvius aims past institutional / multi-b floors.
 * Used by owner-facing copy, ops docs, and `npm run beyond:check`.
 *
 * Every law here must be measurable in code or an explicit founder gate.
 * No vanity claims. No invented ARR.
 */

/** Operators we study — discipline, not theater. */
export const beyondOperators = [
  {
    id: "stripe",
    source: "Stripe",
    mechanic: "Idempotent money and events; fail closed",
    orvius: "Dedupe keys on calls/SMS/alerts; no fake Subscribe until Stripe is live",
  },
  {
    id: "toast",
    source: "Toast",
    mechanic: "Own the money rail, not just the record",
    orvius: "Finish estimates → invoices → Connect payouts before integration rings",
  },
  {
    id: "shopify",
    source: "Shopify",
    mechanic: "Compounding platform from one wedge",
    orvius: "Capture → Record → Command → Proof before expanding OS rings",
  },
  {
    id: "servicetitan",
    source: "ServiceTitan",
    mechanic: "Vertical depth beats horizontal CRM",
    orvius: "HVAC-first receptionist wedge — call→cash before OS expansion",
  },
  {
    id: "linear",
    source: "Linear",
    mechanic: "Respect the user’s time",
    orvius: "Owner language in the dashboard; five-second clarity",
  },
  {
    id: "amazon",
    source: "Amazon",
    mechanic: "Work backwards from the customer outcome",
    orvius: "Ship only what closes call → booked job → collected money",
  },
  {
    id: "agent-proof",
    source: "Harvey / Abridge / Sierra",
    mechanic: "Prove every agent action; escalate exceptions",
    orvius: "ApproveQueue + audit trail; high-risk waits for the owner",
  },
] as const;

/**
 * Category moves that go past multi-b discipline — the monopoly sequence.
 * Order is load-bearing. Skipping ahead dies.
 */
export const beyondMoves = [
  {
    id: "demand-moment",
    title: "Own the demand moment competitors never see",
    detail:
      "Hold the call that never became a job — taxonomy, ZIP, and first-contact on every write.",
  },
  {
    id: "night-shift-category",
    title: "HVAC receptionist wedge before OS theater",
    detail:
      "One paying shop. Overflow/after-hours. Call→cash proven. Live line is the demo.",
  },
  {
    id: "outcome-honesty",
    title: "Outcome honesty before outcome pricing",
    detail: "Pipeline is not collected. Estimated is not recovered. Measure first.",
  },
  {
    id: "prove-confirm-claim",
    title: "Prove → confirm → claim — never the reverse",
    detail: "Line verified before overflow confirm. Wedge before outreach. Proof before case study.",
  },
  {
    id: "compounding-only",
    title: "Refuse work that does not compound",
    detail: "No new rings or marketplace cold-starts until red gates close.",
  },
] as const;

/** Non-negotiable laws — `beyond:check` asserts each in the product. */
export const beyondLaws = [
  {
    id: "L1",
    name: "Wedge sacred",
    measure: "wedge:ready + capture prove-before-confirm",
  },
  {
    id: "L2",
    name: "Nothing fails silent",
    measure: "Alert queue logged; failures on Today; webhook drains",
  },
  {
    id: "L3",
    name: "Owner language",
    measure: "Clarity scan — no internal jargon in owner UI",
  },
  {
    id: "L4",
    name: "Honest money",
    measure: "Economics never labels pipeline as collected",
  },
  {
    id: "L5",
    name: "Fail closed",
    measure: "Billing 402, cron auth, tenant 401 without session",
  },
  {
    id: "L6",
    name: "Demand capture",
    measure: "Every lead write goes through demand-capture",
  },
  {
    id: "L7",
    name: "Exception control",
    measure: "High-risk actions wait in ApproveQueue with audit trail",
  },
  {
    id: "L8",
    name: "Presence",
    measure: "Live line + night-shift claim; brand-swap test",
  },
  {
    id: "L9",
    name: "No vanity green",
    measure: "CI skips stay red; founder gates stay founder",
  },
  {
    id: "L10",
    name: "Compounding only",
    measure: "Taxonomy append-only; monopoly sequence respected",
  },
] as const;

export type BeyondLawId = (typeof beyondLaws)[number]["id"];

/** One-line owner test — would you bet a 2am reputation on this? */
export const beyondOwnerTest =
  "Would I bet my shop’s night jobs on this loop remaining airtight at 2am?" as const;
