import type { CaptureMode, CarrierId } from "@/lib/carrier-forward";
import { pricing } from "@/lib/company";

export type BusyCalendar = { source: string | null; syncedAt: string | null; error: string | null } | null;

export type JobberLink = {
  available: boolean;
  status: "none" | "active" | "disconnected" | "reconnect" | string;
  accountName: string | null;
  connectedAt: string | null;
  lastError: string | null;
  sentLast30Days: number;
  needsAttention: number;
  checking?: number;
  failed?: number;
} | null;

export type HousecallLink = {
  available: boolean;
  status: "none" | "active" | "disconnected" | "reconnect" | string;
  companyName: string | null;
  connectedAt: string | null;
  lastError: string | null;
  sentLast30Days: number;
  needsAttention: number;
  checking?: number;
  failed?: number;
} | null;

export type ServiceTitanLink = {
  available: boolean;
  status: "none" | "active" | "disconnected" | "reconnect" | string;
  providerName: string | null;
  connectedAt: string | null;
  lastError: string | null;
  sentLast30Days: number;
  needsAttention: number;
  checking?: number;
  failed?: number;
} | null;

export type QuickBooksLink = {
  available: boolean;
  status: "none" | "active" | "disconnected" | "reconnect" | string;
  companyName: string | null;
  connectedAt: string | null;
  lastError: string | null;
  sentLast30Days: number;
  needsAttention: number;
  checking?: number;
  failed?: number;
} | null;

export type Account = {
  founder?: boolean;
  /** Whether the saved settings are confirmed on the receptionist, from the record. */
  receptionistApply?: import("@/lib/assistant-apply").ReceptionistApply | null;
  role?: "owner" | "manager" | "dispatcher" | null;
  calendarFeedUrl?: string | null;
  busyCalendar?: BusyCalendar;
  /** Orvius reading the schedule of the connected Jobber, Housecall Pro or ServiceTitan. */
  fsmSchedule?: { source: string; syncedAt: string | null; error: string | null } | null;
  jobber?: JobberLink;
  housecall?: HousecallLink;
  servicetitan?: ServiceTitanLink;
  /** Connectors whose status couldn't be read for this page, by key: jobber, housecall, servicetitan, quickbooks. */
  integrationStatusErrors?: string[];
  quickbooks?: QuickBooksLink;
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
    closedDatesJson?: string | null;
    jobLengthsJson?: string | null;
    timezone?: string | null;
    servicesJson?: string | null;
    serviceZipsJson?: string | null;
    billingStatus?: string;
    environment?: string;
    autopilot?: boolean;
    bookingMode?: "book" | "alert";
    followUpMode?: "off" | "ask" | "auto";
    reviewUrl?: string | null;
    reviewRequestsOn?: boolean;
    bookingPageOn?: boolean;
    webChatOn?: boolean;
    networkOn?: boolean;
    slug?: string;
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
    hasSubscription?: boolean;
    planEndsAt?: string | null;
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
  if (account.business?.environment === "test") return "No plan yet";
  const status = account.billing?.status ?? account.business?.billingStatus ?? "none";
  if (account.billing?.entitled === false && (status === "pilot" || status === "none")) return "Access ended";
  if (status === "pilot") return pricing.pilot.name;
  if (status === "active" || status === "past_due") return account.billing?.plan?.name ?? "Active plan";
  if (status === "canceled") return "Canceled";
  return "No plan";
}

export function planDetail(account: Account): string {
  if (account.business?.environment === "test") return "Test mode. Nothing is charged until you go live.";
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

type Apply = import("@/lib/assistant-apply").ReceptionistApply;
export type SaveReply = {
  business?: Partial<Business>;
  receptionistApply?: Apply | null;
  assistantSynced?: boolean;
  syncError?: string | null;
};

/**
 * What the screen holds after a save's reply: the server's saved values win
 * over what was typed (they are normalized), except fields a newer save still
 * in line is about to change, so a slow reply never undoes a later edit.
 */
export function mergeSaved(prev: Business, sent: Patch, reply: SaveReply, changingLater: ReadonlySet<string>): Business {
  const canonical = reply.business ?? (sent as Partial<Business>);
  const next = { ...prev } as Record<string, unknown>;
  for (const [key, value] of Object.entries(canonical)) {
    if (!changingLater.has(key)) next[key] = value;
  }
  return next as Business;
}

/** A save counts as saved only when the reply carries the saved business record. */
export function isSaveReply(data: unknown): data is SaveReply & { business: Partial<Business> } {
  const business = (data as { business?: unknown } | null)?.business;
  return typeof business === "object" && business !== null && !Array.isArray(business);
}

/**
 * After a lost reply: does the saved record already hold what was sent? Only
 * fields the record reports are compared, and only exact values count, so a
 * value the server would normalize reads as "not shown" rather than "saved".
 */
export function recordHolds(record: Partial<Business>, sent: Patch): "holds" | "differs" | "unknown" {
  const keys = Object.keys(sent);
  if (!keys.length || keys.some((key) => !(key in record))) return "unknown";
  const same = keys.every((key) => {
    const have = (record as Record<string, unknown>)[key];
    const want = sent[key];
    if (typeof want === "boolean" && (typeof have === "string" || have === null)) return want === (have !== null);
    return (have ?? null) === (want ?? null);
  });
  return same ? "holds" : "differs";
}

/**
 * Whether the receptionist took the saved settings, from the reply. A reply
 * without the newer field still says so through assistantSynced/syncError;
 * that is never read as applied, because a resolved request isn't evidence.
 */
export function applyFromReply(reply: SaveReply, previous: Apply | null): Apply | null {
  if (reply.receptionistApply) return reply.receptionistApply;
  if (reply.assistantSynced === false) {
    return {
      state: "failed",
      appliedAt: null,
      error: reply.syncError ?? null,
      next: "Your settings are saved, but the receptionist didn't confirm them. Apply them again; nothing about your phone line changes.",
      canApply: true,
    };
  }
  return previous;
}
