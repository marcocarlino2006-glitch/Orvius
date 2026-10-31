import { isAfterHours } from "@/lib/business";
import { describeSlot } from "@/lib/in-call-tool-defs";
import { logInfo, logWarn } from "@/lib/logger";
import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";

/**
 * A returning caller should not have to start from zero. When a call
 * connects, the live receptionist gets a private note about who usually
 * calls from this number and what the shop last did for them.
 *
 * A phone number is not a person — spouses, landlords and tenants share
 * lines — so the note tells the receptionist to confirm before using it and
 * never to read an address or history back to someone who hasn't confirmed.
 */

type JobRef = { title: string | null; scheduledAt: Date | null; status: string; address: string | null; etaText?: string | null };

const STATUS_WORDS: Record<string, string> = {
  scheduled: "scheduled",
  confirmed: "confirmed",
  en_route: "the technician is on the way",
  on_site: "the technician is there now",
};

export type CallerContextInput = {
  name: string | null;
  interactionCount: number;
  timezone: string;
  lastJob: JobRef | null;
  openJob: JobRef | null;
};

function firstName(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first && first.length > 1 ? first : null;
}

/**
 * Caller ID is on the call, and the model must not recite those digits.
 * The number itself stays out of this note.
 */
export const NUMBER_ON_THIS_CALL =
  'Private note, never read this aloud: a callback number is already on this call. Ask once "Can we use the number you\'re calling from?" If they say yes, say "Got it — we\'ll use the number you\'re calling from." and do not say any digits. If they dictate a different number, read back only the digits they said.';

export function noteForConnectedCall(returning: string | null): string {
  return returning ? `${NUMBER_ON_THIS_CALL} ${returning}` : NUMBER_ON_THIS_CALL;
}

/**
 * The assistant's prompt is synced once and cached by Vapi, so it cannot
 * carry the clock. Without this the model guesses what "today" and
 * "tomorrow" mean and whether the shop is open.
 */
export function clockNote(input: {
  now: Date;
  timezone: string;
  hoursJson: string;
  closedDatesJson?: string | null;
}): string {
  let timezone = input.timezone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(input.now);
  } catch {
    timezone = "America/New_York";
  }
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(input.now);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(input.now);
  const tomorrow = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(
    new Date(input.now.getTime() + 24 * 60 * 60 * 1000),
  );
  const open = !isAfterHours(input.now, input.hoursJson, timezone, input.closedDatesJson);
  return `Private note, never read this aloud: at the shop it is ${day}, ${time}. Tomorrow is ${tomorrow}. The shop is ${
    open ? "open right now" : "closed right now; take the message and mark urgency"
  }. Use this for "today", "tomorrow" and "this weekend".`;
}

export function buildCallerContextNote(input: CallerContextInput): string | null {
  if (input.interactionCount < 2 && !input.lastJob && !input.openJob) return null;
  const who = firstName(input.name);
  const lines = [
    "Private note, never read this aloud: this number has called the shop before.",
    who
      ? `It is usually ${input.name!.trim()}. If your greeting did not already ask, you may ask "Is this ${who}?" Never ask it twice. Only use the details below after they confirm. If they say no, ask their name as usual.`
      : "Their name is not on file. Ask for it as usual.",
  ];
  if (input.openJob) {
    const when = input.openJob.scheduledAt ? ` on ${describeSlot(input.openJob.scheduledAt, input.timezone)}` : "";
    const status = STATUS_WORDS[input.openJob.status] ?? input.openJob.status;
    const eta = input.openJob.status === "en_route" && input.openJob.etaText?.trim() ? `, arriving in about ${input.openJob.etaText.trim()}` : "";
    lines.push(
      `They have an open job: ${input.openJob.title ?? "a service visit"}${when} (${status}${eta}). If they are calling about it, help with that instead of booking new work. Once they confirm who they are, you may tell them this time and status; to move it, follow the rule for moving a visit.`,
    );
  } else {
    lines.push(
      "Nothing is booked for them. If they ask about an earlier request, do not say you found or confirmed it — say you'll take the details now so the team has them, then book or capture as usual.",
    );
  }
  if (input.lastJob) {
    const when = input.lastJob.scheduledAt
      ? ` on ${new Intl.DateTimeFormat("en-US", { timeZone: input.timezone, month: "long", day: "numeric", year: "numeric" }).format(input.lastJob.scheduledAt)}`
      : "";
    lines.push(`Last visit: ${input.lastJob.title ?? "a service visit"}${when}.`);
  }
  const address = input.openJob?.address ?? input.lastJob?.address;
  if (address) {
    lines.push(
      `Address on file: ${address}. Once they confirm who they are, ask "Is this for ${address}?" instead of asking for the address from scratch. Never say the address to someone who has not confirmed their name.`,
    );
  }
  return lines.join(" ");
}

const OPEN = ["scheduled", "confirmed", "en_route", "on_site"];

const NOT_A_NAME = new Set(["unknown", "caller", "customer", "client", "homeowner", "tenant", "owner", "n/a", "na", "none", "sir", "maam", "ma'am", "test", "anonymous", "mr", "mrs", "ms", "dr"]);

const COMPANY = /\b(llc|inc|corp|co|ltd|company|properties|property|management|mgmt|apartments|realty|hoa|church|school|restaurant)\b/i;

/** A first name fit to say out loud, or null for anything an extractor might have filled in instead of a name. */
export function greetableFirstName(name: string | null | undefined): string | null {
  if (!name || COMPANY.test(name)) return null;
  const first = name.trim().split(/\s+/)[0]?.replace(/[.,]$/, "") ?? "";
  if (!/^\p{Lu}\p{Ll}[\p{L}'-]{0,18}$/u.test(first)) return null;
  if (NOT_A_NAME.has(first.toLowerCase())) return null;
  return first;
}

/*
  The opening already carries the recording notice; only its closing question
  changes. A phone is not a person, so the greeting asks rather than assumes,
  the same question the private note allows.
*/
export function returningOpening(opening: string, first: string): string {
  const line = opening.trim();
  const question = line.match(/^(.*[.!])\s+[^.!?]+\?$/);
  return question ? `${question[1]} Is this ${first}?` : `${line} Is this ${first}?`;
}

/** The greeting this caller should hear, or null for the shop's usual one. Gives up past the budget: the caller is listening to ringing. */
export async function loadReturningOpening(params: {
  businessId: string;
  phone: string | null | undefined;
  opening: string;
  budgetMs?: number;
}): Promise<string | null> {
  const phoneNormalized = normalizePhone(params.phone ?? "");
  if (!phoneNormalized) return null;
  const startedAt = Date.now();
  const first = await withinBudget(
    prisma.customer
      .findUnique({
        where: { businessId_phoneNormalized: { businessId: params.businessId, phoneNormalized } },
        select: { name: true },
      })
      .then((customer) => greetableFirstName(customer?.name)),
    params.budgetMs ?? 150,
  );
  logInfo("vapi.returning_greeting", { businessId: params.businessId, ms: Date.now() - startedAt, outcome: first === LATE ? "late" : first ? "named" : "none" });
  return first && first !== LATE ? returningOpening(params.opening, first) : null;
}

export const LATE = Symbol("late");

/** The answer if it comes inside the budget; LATE if not; null if it fails. */
export async function withinBudget<T>(work: Promise<T>, budgetMs: number): Promise<T | null | typeof LATE> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof LATE>((resolve) => {
    timer = setTimeout(() => resolve(LATE), budgetMs);
  });
  try {
    return await Promise.race([work.catch(() => null), late]);
  } finally {
    clearTimeout(timer);
  }
}

export async function loadCallerContextNote(params: {
  businessId: string;
  phone: string;
  timezone: string;
}): Promise<string | null> {
  const phoneNormalized = normalizePhone(params.phone);
  if (!phoneNormalized) return null;
  const customer = await prisma.customer.findUnique({
    where: { businessId_phoneNormalized: { businessId: params.businessId, phoneNormalized } },
    select: {
      name: true,
      interactionCount: true,
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { title: true, scheduledAt: true, status: true, address: true, etaText: true },
      },
    },
  });
  if (!customer) return null;
  const openJob = customer.jobs.find((job) => OPEN.includes(job.status)) ?? null;
  const lastJob = customer.jobs.find((job) => job.status === "completed") ?? null;
  return buildCallerContextNote({
    name: customer.name,
    interactionCount: customer.interactionCount,
    timezone: params.timezone,
    lastJob,
    openJob,
  });
}

/** Hands the note to the live call without making the receptionist speak. */
export async function sendCallerContext(controlUrl: string, note: string) {
  try {
    const res = await fetch(controlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "add-message",
        message: { role: "system", content: note },
        triggerResponseEnabled: false,
      }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch (error) {
    logWarn("vapi.caller_context.failed", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
