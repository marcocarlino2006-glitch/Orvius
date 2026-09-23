/**
 * Multi-b mastery — ordered close sequence for every gate in MULTI-B-STRICT.
 * One source of truth for CLI (`master:all`) and Admin Daily.
 *
 * Rules:
 * - Order is load-bearing. Do not skip ahead.
 * - Founder gates stay founder — never invent Stripe, formation, or proof.
 * - Code-green is not live-green.
 */

import { beyondLaws, beyondOwnerTest } from "@/lib/beyond-bar";
import { getBillingReadiness } from "@/lib/billing-readiness";
import { getBulletproofStatus } from "@/lib/bulletproof-status";
import { company } from "@/lib/company";
import { isConfigured } from "@/lib/env";
import { isEmailConfigured } from "@/lib/email";
import { isConnectConfigured, getConnectStatus } from "@/lib/stripe-connect";

export type MasteryOwner = "founder" | "code" | "ops";

export type MasteryGateId =
  | "wedge_cert"
  | "stripe_saas"
  | "resend"
  | "weekly_proof"
  | "outreach"
  | "formation"
  | "external_proof"
  | "connect_live"
  | "ten_shops"
  | "beyond_laws";

export type MasteryGate = {
  id: MasteryGateId;
  step: number;
  title: string;
  owner: MasteryOwner;
  /** What “done” means in plain English. */
  doneWhen: string;
  /** Concrete next action when red. */
  action: string;
  href?: string;
  ok: boolean;
  detail: string;
};

export type ShopMasterySnapshot = {
  certDone: number;
  wedgeReady: boolean;
  baselineReady: boolean;
  proofFresh: boolean;
  /** Shops with Connect charges enabled (live card path). */
  connectReady: boolean;
  /** Paying or proving partner count (approx from pipeline live/closed). */
  provingShops: number;
  touchesToday: number;
  dailyTarget: number;
  overdueCount: number;
  /** True when prospects look like seeds / examples. */
  seedsOnly: boolean;
  /** External named proof chapter exists (manual until we have a field). */
  externalProof: boolean;
};

export type MasteryReport = {
  gates: MasteryGate[];
  passed: number;
  total: number;
  /** First red gate in order — the only one to work on. */
  next: MasteryGate | null;
  /** Multi-b standard requires all ordered gates green. */
  mastered: boolean;
};

const DEFAULT_SHOP: ShopMasterySnapshot = {
  certDone: 0,
  wedgeReady: false,
  baselineReady: false,
  proofFresh: false,
  connectReady: false,
  provingShops: 0,
  touchesToday: 0,
  dailyTarget: 20,
  overdueCount: 0,
  seedsOnly: true,
  externalProof: false,
};

/**
 * Build the ordered mastery scorecard.
 * Pass shop snapshot from Admin Daily / account API when available.
 */
export function buildMasteryReport(
  shop: Partial<ShopMasterySnapshot> = {},
): MasteryReport {
  const s: ShopMasterySnapshot = { ...DEFAULT_SHOP, ...shop };
  const billing = getBillingReadiness();
  const bullet = getBulletproofStatus();
  const formation = Boolean(company.formationStateConfirmed?.trim());
  const resend = isEmailConfigured();
  const stripeLive = billing.fullyReady;
  const connectPlatform = isConnectConfigured();

  const gates: MasteryGate[] = [
    {
      id: "wedge_cert",
      step: 1,
      title: "Live wedge + founder phone cert",
      owner: "founder",
      doneWhen: "wedge:ready 8/8 on prod + Settings cert 5/5",
      action: "Call your shop line from your cell — stamp all 5 scenarios in Settings",
      href: "/dashboard/settings#founder-cert",
      ok: s.wedgeReady && s.certDone >= 5,
      detail: s.wedgeReady
        ? `Wedge ready · cert ${s.certDone}/5`
        : `Wedge not ready · cert ${s.certDone}/5`,
    },
    {
      id: "stripe_saas",
      step: 2,
      title: "Stripe SaaS → first paid $",
      owner: "founder",
      doneWhen: "Keys + prices + webhook live; first Checkout completed",
      action: "Paste STRIPE_* on Vercel → npm run stripe:setup → complete one Checkout",
      href: "/dashboard/billing",
      ok: stripeLive,
      detail: stripeLive
        ? "Billing fully configured"
        : bullet.gates.find((g) => !g.ok && g.id.startsWith("stripe"))?.detail ??
          `Missing: ${billing.missing.slice(0, 3).join(", ") || "Stripe"}`,
    },
    {
      id: "resend",
      step: 3,
      title: "Email failover (Resend)",
      owner: "founder",
      doneWhen: "RESEND_API_KEY live for magic links + SMS→email backup",
      action: "Paste RESEND_API_KEY (and RESEND_FROM) on Vercel",
      href: "/dashboard/settings#email-failover",
      ok: resend,
      detail: resend ? "Transactional email configured" : "RESEND_API_KEY missing",
    },
    {
      id: "weekly_proof",
      step: 4,
      title: "Baseline + weekly proof ritual",
      owner: "ops",
      doneWhen: "Avg ticket + baselines set; weekly proof stamped <7 days",
      action: "Settings → avg ticket / baselines · Command → Copy weekly proof",
      href: "/dashboard",
      ok: s.baselineReady && s.proofFresh,
      detail: s.baselineReady
        ? s.proofFresh
          ? "Baseline set · proof fresh"
          : "Baseline set · proof stale or missing"
        : "Baseline missing",
    },
    {
      id: "outreach",
      step: 5,
      title: "Real outreach cadence",
      owner: "founder",
      doneWhen: "Real prospect list (no seeds) + 20 touches/day habit",
      action: "Replace seed emails → /admin import CSV → run /admin/daily",
      href: "/admin/daily",
      ok: !s.seedsOnly && s.touchesToday >= s.dailyTarget && s.overdueCount === 0,
      detail: s.seedsOnly
        ? "Pipeline still seed/example contacts"
        : `Touches ${s.touchesToday}/${s.dailyTarget} · overdue ${s.overdueCount}`,
    },
    {
      id: "formation",
      step: 6,
      title: "Legal formation state",
      owner: "founder",
      doneWhen: "Counsel confirms state → ORVIUS_FORMATION_STATE set",
      action: "Set ORVIUS_FORMATION_STATE on Vercel after counsel (one word) — never invent",
      ok: formation,
      detail: formation
        ? `Confirmed: ${company.formationStateConfirmed}`
        : "ORVIUS_FORMATION_STATE unset",
    },
    {
      id: "external_proof",
      step: 7,
      title: "External named proof",
      owner: "founder",
      doneWhen: "One non-Summit shop chapter with measured outcomes",
      action: "Land one external design partner proof — not Summit self-reference",
      href: "/admin",
      ok: s.externalProof,
      detail: s.externalProof ? "External proof recorded" : "No external named proof yet",
    },
    {
      id: "connect_live",
      step: 8,
      title: "Connect — card $ into shop bank",
      owner: "founder",
      doneWhen: "Shop Connect onboarded; charges+payouts enabled; real card settled",
      action: "Onboard shop in Billing → payouts, then take one estimate/deposit card payment",
      href: "/dashboard/billing#payouts",
      ok: connectPlatform && s.connectReady,
      detail: !connectPlatform
        ? "STRIPE_SECRET_KEY required for Connect"
        : s.connectReady
          ? "Shop can accept Connect payments"
          : "Connect code ready — shop not onboarded / charges disabled",
    },
    {
      id: "ten_shops",
      step: 9,
      title: "Ten paying or proving partners",
      owner: "ops",
      doneWhen: "10 shops live/closed proving the wedge with money or stamped proof",
      action: "Keep daily outreach until 10 partners prove — then expand rings",
      href: "/admin/daily",
      ok: s.provingShops >= 10,
      detail: `${s.provingShops}/10 proving shops`,
    },
    {
      id: "beyond_laws",
      step: 10,
      title: "Beyond-bar laws stay green",
      owner: "code",
      doneWhen: "npm run beyond:check passes on every ship",
      action: "Run npm run beyond:check before deploy — fix any red law",
      ok: true, // Static presence; CLI re-verifies. Never claim mastered from UI alone.
      detail: `${beyondLaws.length} laws · ${beyondOwnerTest}`,
    },
  ];

  /*
    beyond_laws is always "ok" in the UI snapshot because the browser cannot run
    the static analyzer. master:all CLI overwrites this with the real exit code.
    For mastered= we require steps 1–9 only from this report; step 10 is CLI.
  */
  const ordered = gates.filter((g) => g.id !== "beyond_laws");
  const passed = ordered.filter((g) => g.ok).length;
  const next = ordered.find((g) => !g.ok) ?? null;

  return {
    gates,
    passed,
    total: ordered.length,
    next,
    mastered: ordered.every((g) => g.ok),
  };
}

/** Connect readiness from a business row (or null). */
export function connectReadyFromBusiness(
  business: Parameters<typeof getConnectStatus>[0] | null | undefined,
) {
  if (!business) return false;
  return getConnectStatus(business).canAcceptPayments;
}

/** Heuristic: seed/example emails must not count as real outreach. */
export function looksLikeSeedProspect(email: string) {
  const e = email.trim().toLowerCase();
  return (
    /@(example\.com|test\.com|orvius\.(im|test))$/.test(e) ||
    e.startsWith("seed+") ||
    e.startsWith("demo+") ||
    e.includes("example+")
  );
}

export const masteryCommands = [
  "npm run beyond:check",
  "npm run multi-b:check",
  "npm run billing:check",
  "npm run wedge:ready",
  "npm run bulletproof",
  "npm run master:all",
] as const;
