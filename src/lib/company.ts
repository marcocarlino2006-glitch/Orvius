/** Legal entity + brand — single source of truth for site copy and agreements. */
export const company = {
  legalName: "Solution Development LLC",
  productName: "Orvius",
  domain: "orvius.im",
  contactEmail: "hello@orvius.im",
  supportEmail: "hello@orvius.im",
  legalEmail: "hello@orvius.im",
  dmcaEmail: "hello@orvius.im",
  foundedYear: 2026,
  trades: ["HVAC", "Plumbing", "Electrical"] as const,
  /** Absolute brand line — night shift for the trades, not SaaS fluff. */
  tagline: "The night shift for the trades.",
  /** Category we are creating — not “AI receptionist.” */
  categoryClaim:
    "The night-shift OS for HVAC, plumbing, and electrical.",
  /** Wedge proof — measurable today. */
  proofLine: "Missed calls become booked jobs.",
  vision:
    "Make missed night jobs obsolete. Orvius is the shop OS that runs after hours — captures demand, books the work, alerts the owner, and compounds one record across every call, job, and dollar. Humans keep high-risk overrides.",
  /** Product goal — not a warranty of a perfect answer rate. */
  mission:
    "Night rule: no demand dies after hours. Capture overflow and night calls, qualify, book, escalate emergencies, and alert the owner. Then expand into customers, scheduling, dispatch, estimates, invoicing, payments, and shop intelligence — one record, one OS.",
  strategy: [
    "Close Capture→Record→Command→Proof on the line before platform vapor — then expand rings.",
    "Dominate one trade and geography with trade-specific intelligence and reliable workflow execution.",
    "Earn the right to run the full shop: security, support, measurable ROI — then expand trades, regions, and shop sizes.",
  ] as const,
  /**
   * Confirm with counsel against formation docs and update before relying on
   * arbitration/venue language in production disputes.
   * FOUNDATION GATE: set the real state name (e.g. "Delaware") — never invent it.
   * See docs/MULTI-BILLION-BATTLES.md Battle 6.
   */
  governingLawState: "the State in which Solution Development LLC is organized",
  jurisdictionNote:
    "the State in which Solution Development LLC is organized",
  /** null until counsel confirms — do not invent a formation state in code. */
  formationStateConfirmed: null as string | null,
  trademarkNotice:
    "Orvius™ and the Orvius logo are trademarks of Solution Development LLC.",
  copyrightNotice: "All rights reserved.",
  smsProgramName: "Orvius Owner Alerts",
  legalUpdated: "September 4, 2026",
} as const;

/**
 * Exponential loops — product must make each irrational not to use.
 * Mastered in order; presence claims only what the loop actually closes.
 */
export const exponentialLoops = [
  {
    id: 1,
    name: "Capture",
    claim: "Missed and after-hours demand becomes a qualified, alerted lead — priority books.",
  },
  {
    id: 2,
    name: "Record",
    claim: "Every touch compounds one customer brain the shop cannot afford to lose.",
  },
  {
    id: 3,
    name: "Command",
    claim: "Attention is the cockpit — book and assign without hunting dashboards.",
  },
  {
    id: 4,
    name: "Proof",
    claim:
      "Weekly captured-demand bookings and estimated value copy as an honest, stamped artifact.",
  },
  {
    id: 5,
    name: "Presence",
    claim: "Company page reads as the OS default — not a SaaS feature stack.",
  },
] as const;


/** Orvius OS — expansion rings. One ring at a time; never skip. */
export const osRings = [
  {
    ring: 1,
    name: "Front door",
    module: "Answer · qualify · alert",
    status: "live" as const,
    body: "Inbound calls and texts handled. Owner notified with a clean summary.",
  },
  {
    ring: 2,
    name: "Customers",
    module: "Record · history · recognition",
    status: "live" as const,
    body: "Callers become customers. Full history from first touch.",
  },
  {
    ring: 3,
    name: "Jobs",
    module: "Book · confirm · schedule",
    status: "live" as const,
    body: "Leads become booked appointments — not sticky notes.",
  },
  {
    ring: 4,
    name: "Field",
    module: "Dispatch · assign · status",
    status: "live" as const,
    body: "Who goes where. The day runs from one board.",
  },
  {
    ring: 5,
    name: "Money",
    module: "Estimate · invoice · pay",
    status: "beta" as const,
    body: "Draft estimates and invoices on jobs; record payments manually. Card rails next.",
  },
  {
    ring: 6,
    name: "Intelligence",
    module: "Answers from your own records",
    status: "beta" as const,
    body: "Ask retrieves calls, jobs, customers, and technician-recorded outcomes with source context. It does not train itself or invent missing facts.",
  },
  {
    ring: 7,
    name: "Platform",
    module: "API · integrations · ecosystem",
    status: "next" as const,
    body: "Other tools plug into Orvius — not the other way around.",
  },
  {
    ring: 8,
    name: "Marketplace",
    module: "Homeowners · match · trust",
    status: "planned" as const,
    body: "Consumers find Orvius shops. Two-sided network.",
  },
] as const;

export const osCurrentRing = 5;

export const legalPages = [
  {
    href: "/terms",
    title: "Terms of Service",
    summary: "Agreement for using Orvius, billing, IP, and dispute resolution.",
  },
  {
    href: "/privacy",
    title: "Privacy Policy",
    summary:
      "Controller/processor roles, categories, CCPA/state rights, retention, AI data, and requests.",
  },
  {
    href: "/cookies",
    title: "Cookie Policy",
    summary: "Cookies and similar technologies on orvius.im.",
  },
  {
    href: "/sms-terms",
    title: "SMS Terms",
    summary: "Text message programs, consent, and opt-out.",
  },
  {
    href: "/refunds",
    title: "Refunds & Cancellation",
    summary: "Subscriptions, pilot transitions, and cancellation.",
  },
  {
    href: "/security",
    title: "Security",
    summary: "Security practices and customer responsibilities (no audit claimed).",
  },
  {
    href: "/dmca",
    title: "DMCA / Copyright",
    summary: "Copyright notices, designated agent, and trademark statement.",
  },
] as const;

export const platformPillars = [
  {
    title: "Capture demand",
    body: "Inbound calls and texts answered — nights, weekends, peak season.",
  },
  {
    title: "Execute the work",
    body: "Qualify, book, assign, and advance the job — humans approve high-risk moves.",
  },
  {
    title: "Prove the economics",
    body: "Booking rate, after-hours captures, and field utilization — not vanity dashboards.",
  },
] as const;

export { pricing, pricingPlans, getPaidPlans, getPlanById, getFeaturedPlan, getLowestPaidPrice } from "@/lib/pricing-plans";
export { shopNeeds, shopSizes, recommendPlan } from "@/lib/plan-needs";
export type { PlanId, PaidPlanId, PricingPlan } from "@/lib/pricing-plans";
export type { ShopNeedId, ShopSizeId, ShopNeed, ShopSize, PlanRecommendation } from "@/lib/plan-needs";
