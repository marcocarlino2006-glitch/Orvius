/** Legal entity + brand — single source of truth for site copy and agreements. */
export const company = {
  legalName: "Solution Development LLC",
  productName: "Orvius",
  domain: "orvius.im",
  contactEmail: "hello@orvius.im",
  supportEmail: "hello@orvius.im",
  legalEmail: "hello@orvius.im",
  foundedYear: 2026,
  trades: ["HVAC", "Plumbing", "Electrical"] as const,
  /** Wedge signal — what the shop feels on day one. */
  tagline: "Every call answered. Every lead owned.",
  /**
   * Best possible outcome: trusted OS + autonomous revenue engine for the trades.
   * We start at the front door and expand one airtight loop at a time.
   */
  vision:
    "Become the trusted operating system and autonomous revenue engine for HVAC, plumbing, and electrical businesses — the invisible 24/7 intelligence layer that captures demand, coordinates the field, moves money, and improves each shop’s economics.",
  mission:
    "Answer every call — especially after-hours and overflow — qualify the customer, book the appointment, escalate emergencies, and notify the owner. Then expand into customers, scheduling, dispatch, estimates, invoicing, payments, and shop intelligence. Humans stay in control of high-risk decisions.",
  strategy: [
    "Dominate one trade and geography first — prove recovered calls, booking rate, and technician utilization.",
    "Ship trade-specific intelligence and reliable workflow execution before platform vapor.",
    "Earn trust through security, support, and measurable ROI — then expand trades, regions, and shop sizes.",
  ] as const,
  jurisdictionNote:
    "the state in which Solution Development LLC is organized",
  smsProgramName: "Orvius Owner Alerts",
  legalUpdated: "August 29, 2026",
} as const;

/** Orvius OS — expansion rings. One ring at a time; never skip. */
export const osRings = [
  {
    ring: 1,
    name: "Front door",
    module: "Answer · qualify · alert",
    status: "live" as const,
    body: "Every call and text handled. Owner notified with a clean summary.",
  },
  {
    ring: 2,
    name: "Customers",
    module: "Record · history · recognition",
    status: "live" as const,
    body: "Every caller becomes a customer. Full history from first touch.",
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
    status: "next" as const,
    body: "Revenue flows through the system — not scattered tools.",
  },
  {
    ring: 6,
    name: "Intelligence",
    module: "AI on every layer",
    status: "live" as const,
    body: "Smarter with every call, job, and outcome. Ask and outcomes live on shop records.",
  },
  {
    ring: 7,
    name: "Platform",
    module: "API · integrations · ecosystem",
    status: "planned" as const,
    body: "Other tools plug into Orvius — not the other way around.",
  },
  {
    ring: 8,
    name: "Marketplace",
    module: "Homeowners · match · trust",
    status: "planned" as const,
    body: "Consumers find Orvius-certified pros. Two-sided network.",
  },
] as const;

export const osCurrentRing = 4;

export const legalPages = [
  {
    href: "/terms",
    title: "Terms of Service",
    summary: "Agreement for using Orvius, billing, and acceptable use.",
  },
  {
    href: "/privacy",
    title: "Privacy Policy",
    summary: "How we collect, use, and protect business and caller data.",
  },
  {
    href: "/cookies",
    title: "Cookie Policy",
    summary: "Cookies and similar technologies on orvius.im.",
  },
  {
    href: "/sms-terms",
    title: "SMS Terms",
    summary: "Text message program terms, consent, and opt-out (TCPA).",
  },
  {
    href: "/refunds",
    title: "Refunds & Cancellation",
    summary: "Subscriptions, pilot transitions, and cancellation.",
  },
  {
    href: "/security",
    title: "Security & Compliance",
    summary: "How we protect data and support regulatory responsibilities.",
  },
] as const;

export const platformPillars = [
  {
    title: "Capture demand",
    body: "Every inbound call and text answered — nights, weekends, peak season.",
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
