import { recordAudit } from "@/lib/audit";
import { safeTimezone, shopDayBounds, zonedWallToUtc } from "@/lib/availability";
import { normalizePhone } from "@/lib/customer";
import { sendCustomerSms } from "@/lib/customer-sms";
import { createJobFromLead } from "@/lib/job";
import { logError } from "@/lib/logger";
import { notifyTechOnAssign } from "@/lib/notify-tech-assign";
import { passLeadToNetwork, takeNetworkJob } from "@/lib/orvius-network";
import { prisma } from "@/lib/prisma";

export { OWNER_REPLY_HINT } from "@/lib/owner-alert-message";

/*
  The owner runs the shop from the alert thread. Every reply acts on the lead
  from the owner's most recent alert, and every answer names that customer, so
  a reply that landed on the wrong lead is obvious in the same breath.
*/

export type OwnerCommand =
  | { kind: "book"; when: string | null }
  | { kind: "move"; when: string }
  | { kind: "text"; body: string }
  | { kind: "contacted" }
  | { kind: "spam" }
  | { kind: "assign"; tech: string }
  | { kind: "today" }
  | { kind: "pass" }
  | { kind: "take" }
  | { kind: "menu" };

export const OWNER_MENU = [
  "Reply to any alert:",
  "BOOK — book it (BOOK FRI 2PM for a time)",
  "MOVE THU 9AM — reschedule",
  "TECH ANA — assign a tech",
  "TEXT <message> — text the customer",
  "CALLED — mark handled",
  "SPAM — not a job",
  "PASS — can't take it: offer it to a nearby Orvius shop",
  "TAKE — claim a job the Orvius Network offered you",
  "TODAY — today's jobs",
].join("\n");

/** What an owner's text asks for, or null when it is not a command. */
export function parseOwnerCommand(raw: string): OwnerCommand | null {
  const text = raw.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase().replace(/[.!]+$/, "");
  if (!lower) return null;

  if (/^(\?|menu|commands|options|what can i (say|do|text)\??)$/.test(lower)) return { kind: "menu" };
  if (/^(today|schedule|jobs|today'?s jobs)$/.test(lower)) return { kind: "today" };
  if (/^(book|book it|book them|yes|y|ok book)$/.test(lower)) return { kind: "book", when: null };
  if (/^(called|handled|got it|on it|i called|called them|talked to them)$/.test(lower)) return { kind: "contacted" };
  if (/^(spam|junk|not a job|wrong number|ignore)$/.test(lower)) return { kind: "spam" };
  if (/^(pass|pass it|refer|refer it|can'?t take it|cant take it)$/.test(lower)) return { kind: "pass" };
  if (/^(take|take it|i'?ll take it|mine)$/.test(lower)) return { kind: "take" };

  const textMatch = text.match(/^(?:text|reply|tell them|send)\s*:?\s+([\s\S]+)$/i);
  if (textMatch && !/^(?:invoice|pay link)/i.test(textMatch[1])) return { kind: "text", body: textMatch[1].trim() };

  const book = lower.match(/^book(?: it| them)?(?: for| at| on)?\s+(.+)$/);
  if (book) return { kind: "book", when: book[1] };

  const move = lower.match(/^(?:move|reschedule|resched|change)(?: it| them)?(?: to)?\s+(.+)$/);
  if (move) return { kind: "move", when: move[1] };

  const tech = lower.match(/^(?:tech|assign|give it to|send tech)\s+([a-z][a-z' -]*)$/);
  if (tech) return { kind: "assign", tech: tech[1].trim() };

  return null;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function shopToday(timezone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: WEEKDAYS.indexOf(get("weekday").toLowerCase().slice(0, 3)),
  };
}

function addDays(ymd: { year: number; month: number; day: number }, days: number) {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * "fri 2pm", "tomorrow 9", "10/3 2:30pm", "oct 3 at 1pm", "3pm" — in the
 * shop's zone. A bare hour from 1 to 6 means the afternoon; a day without a
 * time means 9 AM. Null when it cannot tell.
 */
export function parseShopTime(input: string, timezoneRaw: string, now = new Date()): Date | null {
  const timezone = safeTimezone(timezoneRaw);
  let text = input.toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  const today = shopToday(timezone, now);

  // Dates first, so their digits are never read as an hour.
  let ymd: { year: number; month: number; day: number } | null = null;
  const dated = (month: number, day: number) => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const passed = month < today.month || (month === today.month && day < today.day);
    return { year: today.year + (passed ? 1 : 0), month, day };
  };
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/);
  const named = text.match(new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (slash) {
    ymd = dated(Number(slash[1]), Number(slash[2]));
    if (!ymd) return null;
    text = text.replace(slash[0], " ");
  } else if (named) {
    ymd = dated(MONTHS.indexOf(named[1]) + 1, Number(named[2]));
    if (!ymd) return null;
    text = text.replace(named[0], " ");
  }

  let hour: number | null = null;
  let minute = 0;
  if (/\bnoon\b/.test(text)) {
    hour = 12;
  } else {
    const t = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\b/);
    if (t) {
      const h = Number(t[1]);
      const m = t[2] ? Number(t[2]) : 0;
      const mer = t[3]?.[0];
      if (h > 23 || m > 59 || (mer && h > 12)) return null;
      hour = mer === "p" && h < 12 ? h + 12 : mer === "a" && h === 12 ? 0 : !mer && h >= 1 && h <= 6 ? h + 12 : h;
      minute = m;
    }
  }

  if (!ymd) {
    if (/\btoday\b/.test(text)) ymd = today;
    else if (/\b(tomorrow|tmrw|tmr|tomorow)\b/.test(text)) ymd = addDays(today, 1);
    else {
      const weekday = text.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
      if (weekday) {
        const ahead = (WEEKDAYS.indexOf(weekday[1]) - today.weekday + 7) % 7;
        ymd = addDays(today, ahead);
        const sameDay = zonedWallToUtc(ymd.year, ymd.month, ymd.day, hour ?? 9, minute, 0, timezone);
        if (ahead === 0 && sameDay.getTime() <= now.getTime()) ymd = addDays(today, 7);
      }
    }
  }

  if (!ymd && hour == null) return null;
  if (!ymd) {
    ymd = today;
    const candidate = zonedWallToUtc(ymd.year, ymd.month, ymd.day, hour!, minute, 0, timezone);
    if (candidate.getTime() <= now.getTime()) ymd = addDays(today, 1);
  }
  const at = zonedWallToUtc(ymd.year, ymd.month, ymd.day, hour ?? 9, minute, 0, timezone);
  return at.getTime() > now.getTime() ? at : null;
}

function when(at: Date | null, timezone: string) {
  if (!at) return "no time set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone(timezone),
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

const LEAD_WINDOW_MS = 48 * 60 * 60 * 1000;

type Shop = {
  id: string;
  name: string;
  timezone: string;
  ownerPhone: string | null;
  trade?: string | null;
  address?: string | null;
  networkOn?: boolean;
};

/** The lead the owner's latest alert was about, if it is recent enough to be what they mean. */
async function targetLead(businessId: string, now: Date) {
  const alert = await prisma.ownerNotification.findFirst({
    where: {
      businessId,
      leadId: { not: null },
      channel: "sms",
      createdAt: { gte: new Date(now.getTime() - LEAD_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { leadId: true },
  });
  if (!alert?.leadId) return null;
  return prisma.lead.findFirst({
    where: { id: alert.leadId, businessId },
    include: { job: { include: { technician: { select: { id: true, name: true } } } } },
  });
}

/**
 * Run one owner reply. Returns the text to send back, or null when the message
 * is not a command and should be handled as an ordinary inbound text.
 */
export async function handleOwnerText(params: {
  shop: Shop;
  body: string;
  now?: Date;
}): Promise<string | null> {
  const { shop } = params;
  const now = params.now ?? new Date();
  const command = parseOwnerCommand(params.body);
  if (!command) return null;
  if (command.kind === "menu") return OWNER_MENU;

  if (command.kind === "today") {
    const { start, end } = shopDayBounds(null, shop.timezone, now);
    const jobs = await prisma.job.findMany({
      where: { businessId: shop.id, scheduledAt: { gte: start, lt: end }, status: { notIn: ["cancelled"] } },
      orderBy: { scheduledAt: "asc" },
      take: 12,
      select: {
        title: true,
        scheduledAt: true,
        status: true,
        customer: { select: { name: true } },
        lead: { select: { name: true } },
        technician: { select: { name: true } },
      },
    });
    if (!jobs.length) return "Nothing on the board today.";
    const time = (at: Date | null) =>
      at
        ? new Intl.DateTimeFormat("en-US", { timeZone: safeTimezone(shop.timezone), hour: "numeric", minute: "2-digit" }).format(at)
        : "—";
    return [
      `Today · ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}`,
      ...jobs.map((j) => {
        const who = j.customer?.name ?? j.lead?.name ?? "Customer";
        const tech = j.technician?.name?.split(" ")[0] ?? "no tech";
        const done = j.status === "completed" ? " ✓" : "";
        return `${time(j.scheduledAt)} ${who} · ${j.title} (${tech})${done}`;
      }),
    ].join("\n");
  }

  if (command.kind === "take") {
    return (await takeNetworkJob(shop, now)) ?? "No Orvius Network job is on offer to you right now.";
  }

  const lead = await targetLead(shop.id, now);
  if (!lead) {
    return "No recent lead to act on — this works as a reply to a new-lead alert. Reply ? for the list.";
  }
  const who = lead.name?.trim() || lead.phone || "the customer";
  const audit = {
    businessId: shop.id,
    actor: "owner" as const,
    leadId: lead.id,
    customerId: lead.customerId,
  };

  try {
    switch (command.kind) {
      case "book":
      case "move": {
        const at = command.when ? parseShopTime(command.when, shop.timezone, now) : null;
        if (command.when && !at) {
          return `Couldn't read "${command.when}" as a time. Try ${command.kind.toUpperCase()} FRI 2PM or ${command.kind.toUpperCase()} TOMORROW 9AM.`;
        }
        if (lead.job && command.kind === "book" && !at) {
          return `${who} is already booked · ${when(lead.job.scheduledAt, shop.timezone)}${lead.job.technician ? ` with ${lead.job.technician.name.split(" ")[0]}` : ""}. Reply MOVE <day time> to change it.`;
        }
        if (lead.job) {
          if (lead.job.status === "completed" || lead.job.status === "cancelled") {
            return `${who}'s job is already ${lead.job.status}. Nothing moved.`;
          }
          const previous = lead.job.scheduledAt;
          await prisma.job.update({
            where: { id: lead.job.id },
            data: { scheduledAt: at, customerConfirmedAt: null },
          });
          await recordAudit({
            ...audit,
            entityType: "job",
            entityId: lead.job.id,
            jobId: lead.job.id,
            action: "job.rescheduled",
            summary: `Owner moved the appointment to ${when(at, shop.timezone)} by text.`,
            detail: { from: previous?.toISOString() ?? null, to: at?.toISOString() ?? null, via: "owner_sms" },
          });
          return `Moved ${who} to ${when(at, shop.timezone)}. Reply TEXT <message> to tell them.`;
        }
        const job = await createJobFromLead({ leadId: lead.id, scheduledAt: at, actor: "owner" });
        await prisma.lead.update({ where: { id: lead.id }, data: { status: "booked" } });
        const booked = await prisma.job.findUnique({
          where: { id: job.id },
          select: { scheduledAt: true, technician: { select: { name: true } } },
        });
        const tech = booked?.technician?.name?.split(" ")[0];
        return `Booked ${who} · ${when(booked?.scheduledAt ?? null, shop.timezone)}${tech ? ` with ${tech}` : " · no tech yet (reply TECH <name>)"}.`;
      }

      case "assign": {
        if (!lead.job) return `${who} isn't booked yet. Reply BOOK first, then TECH ${command.tech.toUpperCase()}.`;
        const techs = await prisma.technician.findMany({
          where: { businessId: shop.id, isActive: true },
          select: { id: true, name: true },
        });
        const needle = command.tech.toLowerCase();
        const matches = techs.filter((t) => t.name.toLowerCase().startsWith(needle) || t.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(needle)));
        if (matches.length !== 1) {
          const names = techs.map((t) => t.name.split(" ")[0]).join(", ") || "none on file";
          return matches.length ? `More than one tech matches "${command.tech}". Your crew: ${names}.` : `No tech named "${command.tech}". Your crew: ${names}.`;
        }
        const tech = matches[0];
        if (lead.job.technicianId === tech.id) return `${tech.name} is already on ${who}'s job.`;
        await prisma.job.update({ where: { id: lead.job.id }, data: { technicianId: tech.id } });
        await recordAudit({
          ...audit,
          entityType: "job",
          entityId: lead.job.id,
          jobId: lead.job.id,
          action: "technician.assigned",
          summary: `Owner assigned ${tech.name} by text.`,
          detail: { from: lead.job.technicianId, to: tech.id, via: "owner_sms" },
        });
        const sms = await notifyTechOnAssign({
          jobId: lead.job.id,
          previousTechnicianId: lead.job.technicianId,
          nextTechnicianId: tech.id,
        });
        return `${tech.name} is on ${who}'s job${sms.sent ? " and has the details by text" : ""}.`;
      }

      case "text": {
        if (!lead.phone || !normalizePhone(lead.phone)) return `No number on file for ${who}.`;
        const sent = await sendCustomerSms({ businessId: shop.id, to: lead.phone, body: command.body, author: "owner" });
        if (!sent.sent) {
          return sent.reason === "customer_opted_out"
            ? `${who} has opted out of texts. Call them instead: ${lead.phone}.`
            : `That didn't send. Call ${who} at ${lead.phone}.`;
        }
        if (!lead.firstContactedAt) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { firstContactedAt: now, ...(lead.status === "new" ? { status: "contacted" } : {}) },
          });
        }
        return `Sent to ${who}. Their reply comes to you here.`;
      }

      case "contacted": {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            firstContactedAt: lead.firstContactedAt ?? now,
            ...(lead.status === "new" ? { status: "contacted" } : {}),
          },
        });
        await recordAudit({
          ...audit,
          entityType: "lead",
          entityId: lead.id,
          action: "lead.contacted",
          summary: "Owner marked the lead handled by text.",
          detail: { via: "owner_sms" },
        });
        return `Marked ${who} handled. Reply BOOK if it turned into a job.`;
      }

      case "pass":
        return await passLeadToNetwork(
          { id: shop.id, name: shop.name, trade: shop.trade ?? null, address: shop.address ?? null, networkOn: Boolean(shop.networkOn) },
          lead,
        );

      case "spam": {
        if (lead.job) return `${who} already has a job on the board, so it stays. Cancel it in the app if it's not real.`;
        await prisma.lead.update({ where: { id: lead.id }, data: { status: "spam" } });
        await recordAudit({
          ...audit,
          entityType: "lead",
          entityId: lead.id,
          action: "lead.status_changed",
          summary: "Owner marked the lead not a job by text.",
          detail: { to: "spam", via: "owner_sms" },
        });
        return `Marked ${who} not a job. It won't count or come back.`;
      }
    }
  } catch (error) {
    logError("owner_text.command_failed", {
      businessId: shop.id,
      leadId: lead.id,
      kind: command.kind,
      error: error instanceof Error ? error.message : "unknown",
    });
    const message = error instanceof Error ? error.message : "";
    return message.startsWith("No appointment capacity")
      ? `No open time in the next two weeks for ${who}. Reply BOOK <day time> to pick one.`
      : `That didn't go through for ${who}. Open the app to finish it.`;
  }
  return null;
}
