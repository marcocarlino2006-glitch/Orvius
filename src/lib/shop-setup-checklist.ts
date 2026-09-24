/**
 * Guided shop setup checklist — one shared platform, trade-specific config.
 * Progress + exactly one next action. Does not invent completed steps.
 */

import { TRADES, type Trade } from "@/lib/trades";

/** Readiness path order: Business → Trade rules → Service area → Hours → Phone line → Calendar → Alerts → Test call. */
export type ShopSetupStepId =
  | "identity"
  | "trade"
  | "service_area"
  | "hours"
  | "line"
  | "calendar"
  | "owner_alerts"
  | "verify";

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
  /** Active technicians the schedule can book against. */
  crewCount?: number | null;
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

  const crewOk = (input.crewCount ?? 0) > 0;

  const steps: ShopSetupStep[] = [
    {
      id: "identity",
      label: "Business",
      detail: hasName && hasAddress
        ? `${input.name!.trim()} · address on file`
        : hasName
          ? "Add the shop address callers hear about"
          : "Enter business name and address",
      href: "/dashboard/settings#shop-profile",
      done: hasName && hasAddress,
    },
    {
      id: "trade",
      label: "Trade rules",
      detail:
        trade && servicesOk
          ? `${trade} playbook · services confirmed`
          : trade
            ? `${trade} playbook set — confirm the services you answer for`
            : "Choose HVAC, plumbing, or electrical so urgency rules match the work",
      href: trade ? "/dashboard/settings#hours-services" : "/dashboard/settings#shop-profile",
      done: Boolean(trade) && servicesOk,
    },
    {
      id: "service_area",
      label: "Service area",
      detail: zipsOk ? "Service ZIPs set — out-of-area calls are flagged" : "Add the ZIPs you serve",
      href: "/dashboard/settings#hours-services",
      done: zipsOk,
    },
    {
      id: "hours",
      label: "Hours",
      detail: hoursOk ? "Business hours set — after-hours rules apply outside them" : "Set when the shop is open",
      href: "/dashboard/settings#hours-services",
      done: hoursOk,
    },
    {
      id: "line",
      label: "Phone line",
      detail: !hasLine
        ? "Create your dedicated Orvius number"
        : captureOk
          ? `Line ${input.line} · calls routed to Orvius`
          : `Line ${input.line} — forward missed calls or publish the number`,
      href: hasLine ? "/dashboard/settings#overflow-forward" : "/dashboard/onboarding",
      done: hasLine && captureOk,
    },
    {
      id: "calendar",
      label: "Calendar",
      detail: crewOk
        ? "Jobs book onto the Orvius schedule for your crew"
        : "Add at least one technician so booked jobs have an owner",
      href: "/dashboard/dispatch",
      done: crewOk,
    },
    {
      id: "owner_alerts",
      label: "Alerts",
      detail: alertsOk
        ? "Escalations text your mobile"
        : "Add the mobile that receives escalations",
      href: "/dashboard/settings#owner-alerts",
      done: alertsOk,
    },
    {
      id: "verify",
      label: "Test call",
      detail: lineVerified
        ? "A real call reached Orvius and landed in Calls"
        : "Place one test call — the transcript must land in Calls",
      href: "/dashboard/onboarding",
      done: lineVerified,
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
