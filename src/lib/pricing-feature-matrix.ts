import type { PlanId } from "@/lib/pricing-plans";

export type FeatureCell = boolean | string;

export type PricingFeatureRow = {
  id: string;
  label: string;
  category: string;
  values: Record<PlanId, FeatureCell>;
};

export const pricingFeatureCategories = [
  "Front door",
  "Shop workspace",
  "Field & dispatch",
  "Support",
] as const;

export const pricingFeatureMatrix: readonly PricingFeatureRow[] = [
  {
    id: "dedicated-line",
    label: "Dedicated shop line",
    category: "Front door",
    values: {
      pilot: true,
      line: true,
      pro: true,
      fleet: true,
      multi: true,
    },
  },
  {
    id: "ai-receptionist",
    label: "AI receptionist (your shop name)",
    category: "Front door",
    values: {
      pilot: true,
      line: true,
      pro: true,
      fleet: true,
      multi: true,
    },
  },
  {
    id: "owner-sms",
    label: "Owner SMS alerts",
    category: "Front door",
    values: {
      pilot: true,
      line: true,
      pro: true,
      fleet: true,
      multi: true,
    },
  },
  {
    id: "lead-inbox",
    label: "Lead inbox",
    category: "Front door",
    values: {
      pilot: true,
      line: true,
      pro: true,
      fleet: true,
      multi: true,
    },
  },
  {
    id: "call-log",
    label: "Call log & transcripts",
    category: "Front door",
    values: {
      pilot: true,
      line: true,
      pro: true,
      fleet: true,
      multi: true,
    },
  },
  {
    id: "auto-book",
    label: "Auto-book leads to jobs",
    category: "Front door",
    values: {
      pilot: true,
      line: false,
      pro: true,
      fleet: true,
      multi: true,
    },
  },
  {
    id: "customers",
    label: "Customer records",
    category: "Shop workspace",
    values: {
      pilot: true,
      line: false,
      pro: true,
      fleet: true,
      multi: true,
    },
  },
  {
    id: "jobs",
    label: "Jobs & scheduling",
    category: "Shop workspace",
    values: {
      pilot: true,
      line: false,
      pro: true,
      fleet: true,
      multi: true,
    },
  },
  {
    id: "ask",
    label: "Ask — shop intelligence",
    category: "Shop workspace",
    values: {
      pilot: true,
      line: false,
      pro: true,
      fleet: true,
      multi: true,
    },
  },
  {
    id: "dispatch",
    label: "Dispatch board",
    category: "Field & dispatch",
    values: {
      pilot: true,
      line: false,
      pro: true,
      fleet: true,
      multi: true,
    },
  },
  {
    id: "tech-limit",
    label: "Technicians on dispatch",
    category: "Field & dispatch",
    values: {
      pilot: "15",
      line: "—",
      pro: "15",
      fleet: "Unlimited",
      multi: "Custom",
    },
  },
  {
    id: "multi-location",
    label: "Multi-location admin",
    category: "Field & dispatch",
    values: {
      pilot: false,
      line: false,
      pro: false,
      fleet: false,
      multi: true,
    },
  },
  {
    id: "onboarding",
    label: "Onboarding",
    category: "Support",
    /*
      Onboarding is self-serve on every paid plan — sign in, answer the wizard,
      and the line is provisioned by the time you reach the forwarding step.
      "Priority" and "Dedicated" described a queue that does not exist.
    */
    values: {
      pilot: "Guided",
      line: "Self-serve",
      pro: "Self-serve",
      fleet: "Self-serve",
      multi: "Custom playbook",
    },
  },
  {
    id: "support",
    label: "Support",
    category: "Support",
    /*
      One row, one answer. This used to climb from "Email" to "Priority email"
      to "Priority line" to "Dedicated CSM" across the tiers, and all four were
      the same inbox — there is no second number and there is no CSM. A matrix
      exists so a buyer can tell the plans apart; inventing a difference here
      is the one thing it must never do.
    */
    values: {
      pilot: "Email · 1 business day",
      line: "Email · 1 business day",
      pro: "Email · 1 business day",
      fleet: "Email · 1 business day",
      multi: "Email · 1 business day",
    },
  },
  {
    id: "annual",
    label: "Annual billing discount",
    category: "Support",
    values: {
      pilot: false,
      line: true,
      pro: true,
      fleet: true,
      multi: "Custom",
    },
  },
] as const;

export const pricingCompareColumns: readonly PlanId[] = [
  "pilot",
  "line",
  "pro",
  "fleet",
];
