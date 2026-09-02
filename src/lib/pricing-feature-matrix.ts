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
    label: "Personal onboarding",
    category: "Support",
    values: {
      pilot: true,
      line: "Email",
      pro: "Email",
      fleet: "Priority",
      multi: "Dedicated",
    },
  },
  {
    id: "support",
    label: "Support",
    category: "Support",
    values: {
      pilot: "Design partner",
      line: "Email",
      pro: "Priority email",
      fleet: "Priority line",
      multi: "Dedicated CSM",
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
