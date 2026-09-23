/**
 * Guided shop setup checklist — one shared platform, trade-specific config.
 * Progress + exactly one next action. Does not invent completed steps.
 */

import { TRADES, type Trade } from "@/lib/trades";

export type ShopSetupStepId =
  | "trade"
  | "identity"
  | "line"
  | "verify"
  | "owner_alerts"
  | "hours_area"
  | "capture"
  | "services";

export type ShopSetupStep = {
  id: ShopSetupStepId;
  label: string;
  detail: string;
  href: string;
  done: boolean;
};

export type ShopSetupChecklist = {
  steps: ShopSetupStep[];
  doneCount: number;
  totalCount: number;
  /** Fraction 0–1 */
  progress: number;
  next: ShopSetupStep | null;
  readyForNight: boolean;
};

export type ShopSetupInput = {
  name?: string | null;
  trade?: string | null;
  address?: string | null;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  line?: string | null;
  lineVerified?: boolean;
  captureConfirmed?: boolean;
  hoursJson?: string | null;
  servicesJson?: string | null;
  serviceZipsJson?: string | null;
};

function hasPhone(value: string | null | undefined): boolean {
  return Boolean(value && value.replace(/\D/g, "").length >= 10);
}

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hoursConfigured(hoursJson: string | null | undefined): boolean {
  if (!hoursJson?.trim() || hoursJson.trim() === "{}") return false;
  try {
    const hours = JSON.parse(hoursJson) as Record<string, unknown>;
    return Object.keys(hours).length >= 5;
  } catch {
    return false;
  }
}

export function normalizeTrade(value: string | null | undefined): Trade | null {
  if (!value) return null;
  const match = TRADES.find((t) => t.toLowerCase() === value.trim().toLowerCase());
  return match ?? null;
}

export function buildShopSetupChecklist(input: ShopSetupInput): ShopSetupChecklist {
  const trade = normalizeTrade(input.trade);
  const hasName = Boolean(input.name?.trim() && input.name.trim().length >= 2);
  const hasAddress = Boolean(input.address?.trim() && input.address.trim().length >= 5);
  const hasLine = Boolean(input.line?.trim());
  const lineVerified = Boolean(input.lineVerified);
  const alertsOk = hasPhone(input.ownerPhone);
  const hoursOk = hoursConfigured(input.hoursJson);
  const zipsOk = parseJsonArray(input.serviceZipsJson).length > 0;
  const servicesOk = parseJsonArray(input.servicesJson).length > 0;
  const captureOk = Boolean(input.captureConfirmed) || lineVerified;

  const steps: ShopSetupStep[] = [
    {
      id: "trade",
      label: "Trade",
      detail: trade
        ? `${trade} — prompts and urgency rules match this trade`
        : "Choose HVAC, plumbing, electrical, or another trade",
      href: "/dashboard/settings#shop-profile",
      done: Boolean(trade),
    },
    {
      id: "identity",
      label: "Shop identity",
      detail: hasName && hasAddress
        ? `${input.name!.trim()} · address on file`
        : hasName
          ? "Add the shop address callers hear about"
          : "Enter business name and address",
      href: "/dashboard/settings#shop-profile",
      done: hasName && hasAddress,
    },
    {
      id: "line",
      label: "Shop line",
      detail: hasLine ? `Line ${input.line}` : "Create your dedicated Orvius number",
      href: "/dashboard/onboarding",
      done: hasLine,
    },
    {
      id: "verify",
      label: "Prove the line",
      detail: lineVerified
        ? "A real call reached Orvius"
        : "Place one test call — transcript must land in Calls",
      href: "/dashboard/onboarding",
      done: lineVerified,
    },
    {
      id: "owner_alerts",
      label: "Owner alerts",
      detail: alertsOk
        ? "Night leads SMS your mobile"
        : "Add the cell that gets after-hours leads",
      href: "/dashboard/settings#owner-alerts",
      done: alertsOk,
    },
    {
      id: "hours_area",
      label: "Hours & service area",
      detail:
        hoursOk && zipsOk
          ? "Hours and ZIPs set"
          : hoursOk
            ? "Add service-area ZIPs"
            : "Set business hours and service ZIPs",
      href: "/dashboard/settings#hours-services",
      done: hoursOk && zipsOk,
    },
    {
      id: "services",
      label: "Services",
      detail: servicesOk
        ? "Trade services on the receptionist"
        : "Confirm the services this shop answers for",
      href: "/dashboard/settings#hours-services",
      done: servicesOk,
    },
    {
      id: "capture",
      label: "Call capture",
      detail: captureOk
        ? "Overflow/publish path ready"
        : "Forward missed calls or publish the Orvius number",
      href: "/dashboard/settings#overflow-forward",
      done: Boolean(input.captureConfirmed),
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  const next = steps.find((s) => !s.done) ?? null;
  const readyForNight = Boolean(
    trade && hasName && hasLine && lineVerified && alertsOk,
  );

  return {
    steps,
    doneCount,
    totalCount,
    progress: totalCount ? doneCount / totalCount : 0,
    next,
    readyForNight,
  };
}
