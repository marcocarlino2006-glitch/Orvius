/** Legal entity + brand — single source of truth for site copy and agreements. */
import {
  formationGoverningLawLabel,
  resolveFormationStateConfirmed,
} from "@/lib/formation-state";

const formationStateConfirmed = resolveFormationStateConfirmed();
const governingLawState = formationGoverningLawLabel(formationStateConfirmed);

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
  /**
   * Wedge first (founder lock 2026-09-22): beginning = focused AI receptionist
   * for HVAC after-hours/overflow — not the full OS. Expand only after one shop
   * pays and call→cash is proven.
   */
  tagline: "After-hours HVAC receptionist that turns missed calls into paid jobs.",
  /** Category for the beginning — OS is earned after the wedge pays. */
  categoryClaim:
    "A focused AI receptionist for HVAC — answers, qualifies, books, confirms, and alerts the owner. When a caller asks for a person, Orvius can transfer live to the owner cell when one is on file — otherwise the call lands on the board for callback.",
  /** Wedge proof — one missed call → one completed, paid job. */
  proofLine: "Missed HVAC calls become booked, completed, paid jobs.",
  vision:
    "Prove that one local HVAC company will pay Orvius to turn one customer call into one completed and paid job. Only then expand recovery, follow-up, estimates, memberships, analytics — and only after that dispatch, tech workflows, equipment history, payments, and the broader OS.",
  /**
   * Product goal for the beginning — controlled pilot on overflow/after-hours.
   * Dashboard north star: demand captured → completed work → money produced.
   */
  mission:
    "Deploy with one local HVAC company on overflow or after-hours. Answer inbound calls, understand the problem, capture address and contact, identify urgency, check service area, book, confirm, and notify the shop. When the caller wants a person, transfer live to the owner cell when configured — otherwise escalate to the board for a callback. Charge a controlled pilot. Track calls answered, leads captured, appointments booked, jobs completed, and revenue influenced — until the wedge pays.",
  strategy: [
    "One HVAC shop first — overflow/after-hours pilot that pays.",
    "Prove call → cash: demand captured, completed work, money produced.",
    "Own context/workflow/data/transactions — use replaceable models; expand OS and trades only after the wedge compounds.",
  ] as const,
  /**
   * Confirm with counsel against formation docs before relying on arbitration
   * / venue language. Counsel-confirmed 2026-09-23: New York.
   * Override with ORVIUS_FORMATION_STATE on Vercel only if counsel revises.
   * See docs/MULTI-BILLION-BATTLES.md Battle 6.
   */
  governingLawState,
  jurisdictionNote: governingLawState,
  /** Counsel-confirmed via formation-state.ts — New York (2026-09-23). */
  formationStateConfirmed,
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
    claim: "Missed and after-hours demand becomes a qualified, alerted lead — window proposed.",
  },
  {
    id: 2,
    name: "Record",
    claim: "Every touch compounds one customer brain the shop cannot afford to lose.",
  },
  {
    id: 3,
    name: "Command",
    claim: "Attention is the cockpit — act without hunting dashboards.",
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
    body: "Leads become proposed windows — customer confirms by text.",
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
    body: "Draft estimates and invoices on jobs; take booking deposits and card pay when Connect is ready. Manual payment recording stays available.",
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
