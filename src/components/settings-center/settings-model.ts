import type { CaptureMode, CarrierId } from "@/lib/carrier-forward";
import { pricing } from "@/lib/company";

export type BusyCalendar = { source: string | null; syncedAt: string | null; error: string | null } | null;

export type Account = {
  founder?: boolean;
  calendarFeedUrl?: string | null;
  busyCalendar?: BusyCalendar;
  user?: { name: string | null; email: string | null; image?: string | null };
  business: {
    name: string;
    trade?: string | null;
    address?: string | null;
    ownerPhone: string | null;
    ownerEmail: string | null;
    greeting: string | null;
    transferPhone?: string | null;
    voiceId?: string | null;
    avgTicketCents: number | null;
    baselineMissedCallsPerWeek: number | null;
    baselineJobsPerWeek: number | null;
    founderCertJson?: string | null;
    overflowForwardConfirmedAt?: string | null;
    overflowProvedAt?: string | null;
    forwardGuideSentAt?: string | null;
    captureMode?: CaptureMode | null;
    forwardCarrier?: CarrierId | null;
    lineVerifiedAt?: string | null;
    hoursJson?: string | null;
    servicesJson?: string | null;
    serviceZipsJson?: string | null;
    billingStatus?: string;
    autopilot?: boolean;
    createdAt?: string;
    vapiPhoneNumber?: string | null;
    twilioPhone?: string | null;
  } | null;
  line?: string | null;
  billing?: {
    configured?: boolean;
    fullyReady?: boolean;
    entitled?: boolean;
    status?: string;
    plan?: { name: string; price: number; period?: string };
    pilotEndsAt?: string | null;
  };
  alerts: {
    smsEnabled: boolean;
    emailConfigured: boolean;
    ownerSmsOptedOut?: boolean;
  };
};

export type Technician = { id: string; name: string; phone?: string | null };

export type Patch = Record<string, unknown>;

export const FOUNDER_CERT = [
  "AC emergency after hours — name, phone, service, urgency, address",
  "Caller asks for a human — 15-min callback offered",
  "Non-urgent estimate — urgency this-week or flexible",
  "Hang-up mid-call — partial lead, no crash",
  "Inbound SMS — lead + auto-reply",
] as const;

export function parseCert(raw: string | null | undefined): boolean[] {
  const empty = FOUNDER_CERT.map(() => false);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as boolean[];
    return Array.isArray(parsed) && parsed.length === FOUNDER_CERT.length ? parsed.map(Boolean) : empty;
  } catch {
    return empty;
  }
}

export function planLabel(account: Account): string {
  const status = account.billing?.status ?? account.business?.billingStatus ?? "none";
  if (account.billing?.entitled === false && (status === "pilot" || status === "none")) return "Access ended";
  if (status === "pilot") return pricing.pilot.name;
  if (status === "active" || status === "past_due") return account.billing?.plan?.name ?? "Active plan";
  if (status === "canceled") return "Canceled";
  return "No plan";
}

export function planDetail(account: Account): string {
  const status = account.billing?.status ?? "none";
  if (status === "active") return "Your subscription is active.";
  if (status === "past_due") return "Payment failed — update your card to keep the line live.";
  if (status === "pilot") {
    const ends = account.billing?.pilotEndsAt ? new Date(account.billing.pilotEndsAt) : null;
    return ends && !Number.isNaN(ends.getTime())
      ? `Access through ${ends.toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`
      : "Your shop access is active.";
  }
  return "No active subscription yet.";
}

export function dollars(value: string): number | null {
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return value.trim() && Number.isFinite(n) ? n : null;
}

export type Business = NonNullable<Account["business"]>;

export type PatchFn = (fields: Patch) => Promise<boolean>;
