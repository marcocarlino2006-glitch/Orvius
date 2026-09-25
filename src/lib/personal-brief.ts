import { isAfterHours } from "@/lib/business";
import { demandCategoryLabel } from "@/lib/job-taxonomy";

/**
 * The top of Command, written for one owner.
 *
 * Every shop used to open to the same sentence shape — "Last 24 hours · 3 calls
 * answered". This reads the moment in the shop's own time zone, what changed
 * since this owner last looked, and patterns in this shop's own history, and
 * says only the parts that are true for them. A pattern is never shown until
 * there is enough history behind it; a new shop gets its next step instead.
 */

export type DayMoment = "morning" | "day" | "evening" | "night";

export type PatternInput = {
  calls: Array<{ createdAt: Date }>;
  leads: Array<{ categoryCode: string | null; returning: boolean }>;
  hoursJson: string;
  timezone: string;
};

export type ShopPattern = { key: "busiest" | "after_hours" | "top_job" | "returning"; text: string };

export type PersonalBriefInput = {
  now: Date;
  timezone: string;
  firstName: string | null;
  /** When this owner last opened Command on this device; null on first visit. */
  since: {
    at: Date;
    calls: number;
    booked: number;
    needsYou: number;
  } | null;
  today: {
    jobs: number;
    unassigned: number;
    firstJobAt: Date | null;
    firstJobTech: string | null;
    completed: number;
    bookedToday: number;
  };
  totalCalls: number;
  lineVerified: boolean;
  afterHoursNow: boolean;
  patterns: ShopPattern[];
};

export type PersonalBrief = {
  moment: DayMoment;
  greeting: string;
  headline: string;
  detail: string[];
  pattern: string | null;
};

const MIN_CALLS_FOR_TIMING = 20;
const MIN_LEADS_FOR_MIX = 10;
/** Older than this, "since you looked" stops being useful and the day's board leads instead. */
const SINCE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SINCE_MIN_AGE_MS = 60 * 1000;

export function parseSince(raw: string | null, now: Date): Date | null {
  if (!raw) return null;
  const at = new Date(raw);
  const age = now.getTime() - at.getTime();
  if (Number.isNaN(at.getTime()) || age < SINCE_MIN_AGE_MS || age > SINCE_MAX_AGE_MS) return null;
  return at;
}

export function firstNameFrom(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  if (!first || first.includes("@")) return null;
  return first.slice(0, 24);
}

function localParts(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: get("weekday"), hour: Number(get("hour")) % 24 };
}

export function dayMoment(now: Date, timezone: string): DayMoment {
  const { hour } = localParts(now, timezone);
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function hourLabel(hour: number) {
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function sinceLabel(from: Date, now: Date) {
  const minutes = Math.max(1, Math.round((now.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function timeLabel(at: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(at);
}

/** Patterns in this shop's own history, each gated on enough data to be true. */
export function learnShopPatterns(input: PatternInput): ShopPattern[] {
  const patterns: ShopPattern[] = [];
  const { calls, leads, timezone } = input;

  if (calls.length >= MIN_CALLS_FOR_TIMING) {
    const buckets = new Map<string, number>();
    for (const call of calls) {
      const { weekday, hour } = localParts(call.createdAt, timezone);
      const block = hour - (hour % 2);
      const key = `${weekday}|${block}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const [bestKey, bestCount] = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = bestCount / calls.length;
    if (share >= 0.12 && bestCount >= 4) {
      const [weekday, block] = bestKey.split("|");
      patterns.push({
        key: "busiest",
        text: `Your busiest stretch is ${weekday}s ${hourLabel(Number(block))}–${hourLabel(Number(block) + 2)} — ${Math.round(share * 100)}% of your calls.`,
      });
    }

    const afterHours = calls.filter((c) => isAfterHours(c.createdAt, input.hoursJson, timezone)).length;
    const afterShare = afterHours / calls.length;
    if (afterShare >= 0.15) {
      patterns.push({
        key: "after_hours",
        text: `${Math.round(afterShare * 100)}% of your calls come in after hours — ${plural(afterHours, "call")} the line picked up while you were closed.`,
      });
    }
  }

  const service = leads.filter((l) => l.categoryCode && l.categoryCode !== "other.non_service");
  if (service.length >= MIN_LEADS_FOR_MIX) {
    const counts = new Map<string, number>();
    for (const lead of service) counts.set(lead.categoryCode!, (counts.get(lead.categoryCode!) ?? 0) + 1);
    const [code, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const label = demandCategoryLabel(code);
    const share = count / service.length;
    if (label && share >= 0.3) {
      patterns.push({
        key: "top_job",
        text: `${label} is ${Math.round(share * 100)}% of your work lately.`,
      });
    }
  }

  if (leads.length >= MIN_LEADS_FOR_MIX) {
    const returning = leads.filter((l) => l.returning).length;
    const share = returning / leads.length;
    if (share >= 0.15) {
      const oneIn = Math.max(2, Math.round(1 / share));
      patterns.push({ key: "returning", text: `About 1 in ${oneIn} callers has called you before.` });
    }
  }

  return patterns;
}

function dayOfYear(now: Date, timezone: string) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000);
}

export function composePersonalBrief(input: PersonalBriefInput): PersonalBrief {
  const { now, timezone, firstName, since, today, patterns } = input;
  const moment = dayMoment(now, timezone);
  const hello = { morning: "Morning", day: "Afternoon", evening: "Evening", night: "Late one" }[moment];
  const greeting = firstName ? `${hello}, ${firstName}.` : `${hello}.`;
  const detail: string[] = [];

  let headline: string;
  if (!input.lineVerified || input.totalCalls === 0) {
    headline = input.lineVerified
      ? "Your line is live. The first real call will show up here the moment it ends."
      : "One step left: call your Orvius line once so we can prove it answers.";
  } else if (since && since.calls + since.booked + since.needsYou > 0) {
    const parts = [
      since.calls ? plural(since.calls, "call") : null,
      since.booked ? `${since.booked} booked` : null,
      since.needsYou ? `${since.needsYou} ${since.needsYou === 1 ? "needs" : "need"} you` : null,
    ].filter(Boolean);
    headline = `Since you looked ${sinceLabel(since.at, now)}: ${parts.join(", ")}.`;
  } else if (since) {
    headline = `Quiet since you looked ${sinceLabel(since.at, now)} — nothing new needs you.`;
  } else if (moment === "morning") {
    headline = today.jobs ? `${plural(today.jobs, "job")} on the board today.` : "Nothing on the board yet today.";
  } else if (moment === "evening" || moment === "night") {
    headline = `Today: ${plural(today.bookedToday, "job")} booked, ${today.completed} completed.`;
  } else {
    headline = today.jobs ? `${plural(today.jobs, "job")} on today's board.` : "No jobs on the board today.";
  }

  if (moment === "morning" && today.firstJobAt) {
    detail.push(
      `First job ${timeLabel(today.firstJobAt, timezone)}${today.firstJobTech ? ` with ${today.firstJobTech}` : ""}.`,
    );
  }
  if (today.unassigned) detail.push(`${plural(today.unassigned, "job")} still without a technician.`);
  if (input.afterHoursNow && input.lineVerified) detail.push("You're closed — the line is covering calls.");

  const pattern = patterns.length ? patterns[dayOfYear(now, timezone) % patterns.length].text : null;

  return { moment, greeting, headline, detail, pattern };
}
