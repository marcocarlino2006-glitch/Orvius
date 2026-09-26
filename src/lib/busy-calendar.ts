import type { Business } from "@prisma/client";
import { isValidTimezone, MAX_SCHEDULE_DAYS, zonedWallToUtc, type BusyWindow } from "@/lib/availability";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/*
  The owner's own calendar (their private iCal address) blocks booking: a time
  they are busy there is never offered to a caller. Read-only, no OAuth — the
  address is the credential, so it is only ever fetched from the calendar
  providers below, never from an arbitrary host.
*/

const ALLOWED_HOSTS = [/^calendar\.google\.com$/, /^([a-z0-9-]+\.)*icloud\.com$/, /^outlook\.(office365|office|live)\.com$/];
const MAX_BYTES = 3_000_000;
const FETCH_TIMEOUT_MS = 2500;
export const BUSY_REFRESH_MS = 10 * 60_000;
const HORIZON_MS = (MAX_SCHEDULE_DAYS + 1) * 86_400_000;
const MAX_WINDOWS = 2000;
const MAX_DAYS_EXPANDED = 20_000;

export type BusyCalendarCheck = { ok: true; url: string } | { ok: false; error: string };

export function normalizeBusyCalendarUrl(raw: string): BusyCalendarCheck {
  const trimmed = raw.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "That isn't a web address. Paste the calendar's secret iCal address." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Use the https:// address of the calendar." };
  if (!ALLOWED_HOSTS.some((re) => re.test(url.hostname.toLowerCase()))) {
    return { ok: false, error: "Use a Google, Apple (iCloud), or Outlook calendar address." };
  }
  return { ok: true, url: url.toString() };
}

export function busyCalendarHost(url: string | null | undefined) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("google.com")) return "Google Calendar";
    if (host.endsWith("icloud.com")) return "Apple Calendar";
    return "Outlook";
  } catch {
    return null;
  }
}

type Prop = { name: string; params: Record<string, string>; value: string };
type RawEvent = Prop[];

function unfold(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseProp(line: string): Prop | null {
  const colon = findValueColon(line);
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

/* Parameter values may be quoted and contain colons (TZID="GMT-05:00"). */
function findValueColon(line: string) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) return i;
  }
  return -1;
}

function events(text: string): RawEvent[] {
  const out: RawEvent[] = [];
  let current: RawEvent | null = null;
  let depth = 0;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      current = [];
      depth = 0;
    } else if (line === "END:VEVENT") {
      if (current) out.push(current);
      current = null;
    } else if (current) {
      if (line.startsWith("BEGIN:")) depth++;
      else if (line.startsWith("END:")) depth--;
      else if (depth === 0) {
        const prop = parseProp(line);
        if (prop) current.push(prop);
      }
    }
  }
  return out;
}

const WINDOWS_ZONES: Record<string, string> = {
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "US Mountain Standard Time": "America/Phoenix",
  "Pacific Standard Time": "America/Los_Angeles",
  "Alaskan Standard Time": "America/Anchorage",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Atlantic Standard Time": "America/Halifax",
  UTC: "UTC",
};

function resolveZone(tzid: string | undefined, fallback: string) {
  if (!tzid) return fallback;
  if (WINDOWS_ZONES[tzid]) return WINDOWS_ZONES[tzid];
  return isValidTimezone(tzid) ? tzid : fallback;
}

/** A point in time plus the wall clock it was written in, so repeats keep local time across DST. */
type Stamp = { at: Date; allDay: boolean; wall: { y: number; m: number; d: number; h: number; mi: number; s: number }; zone: string };

function wallOf(at: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute"), s: get("second") };
}

function parseStamp(value: string, params: Record<string, string>, shopZone: string): Stamp | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (m[4] == null || params.VALUE === "DATE") {
    const wall = { y, m: mo, d, h: 0, mi: 0, s: 0 };
    return { at: zonedWallToUtc(y, mo, d, 0, 0, 0, shopZone), allDay: true, wall, zone: shopZone };
  }
  const [h, mi, s] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  if (m[7]) {
    const at = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    return { at, allDay: false, wall: wallOf(at, shopZone), zone: shopZone };
  }
  const zone = resolveZone(params.TZID, shopZone);
  return { at: zonedWallToUtc(y, mo, d, h, mi, s, zone), allDay: false, wall: { y, m: mo, d, h, mi, s }, zone };
}

function parseDurationMs(value: string) {
  const m = value.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const ms =
    ((Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)) * 86_400 + Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0)) *
    1000;
  return m[1] === "-" ? -ms : ms;
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

type Rule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count: number | null;
  until: Date | null;
  byDay: { ord: number; day: number }[];
  byMonthDay: number[];
  byMonth: number[];
  weekStart: number;
};

function parseRule(value: string, shopZone: string): Rule | null {
  const parts = Object.fromEntries(
    value.split(";").map((kv) => {
      const [k, v] = kv.split("=");
      return [k.toUpperCase(), v ?? ""];
    }),
  );
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(parts.FREQ)) return null;
  const byDay = (parts.BYDAY ? parts.BYDAY.split(",") : []).flatMap((code: string) => {
    const m = code.match(/^([+-]?\d+)?([A-Z]{2})$/);
    const day = m ? DAY_CODES.indexOf(m[2]) : -1;
    return m && day >= 0 ? [{ ord: m[1] ? Number(m[1]) : 0, day }] : [];
  });
  const until = parts.UNTIL ? parseStamp(parts.UNTIL, {}, shopZone) : null;
  return {
    freq: parts.FREQ as Rule["freq"],
    interval: Math.max(1, Number(parts.INTERVAL) || 1),
    count: parts.COUNT ? Number(parts.COUNT) || null : null,
    until: until ? (until.allDay ? new Date(until.at.getTime() + 86_400_000 - 1) : until.at) : null,
    byDay,
    byMonthDay: parts.BYMONTHDAY ? parts.BYMONTHDAY.split(",").map(Number).filter(Boolean) : [],
    byMonth: parts.BYMONTH ? parts.BYMONTH.split(",").map(Number).filter(Boolean) : [],
    weekStart: parts.WKST ? Math.max(0, DAY_CODES.indexOf(parts.WKST)) : 1,
  };
}

const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);

function matchesRule(rule: Rule, start: Stamp["wall"], y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (rule.byMonth.length && !rule.byMonth.includes(m)) return false;
  const startDay = dayNumber(start.y, start.m, start.d);
  const today = dayNumber(y, m, d);

  switch (rule.freq) {
    case "DAILY":
      if ((today - startDay) % rule.interval !== 0) return false;
      return !rule.byDay.length || rule.byDay.some((b) => b.day === weekday);
    case "WEEKLY": {
      const weekOf = (n: number) => n - ((new Date(n * 86_400_000).getUTCDay() - rule.weekStart + 7) % 7);
      if (((weekOf(today) - weekOf(startDay)) / 7) % rule.interval !== 0) return false;
      const days = rule.byDay.length ? rule.byDay.map((b) => b.day) : [new Date(startDay * 86_400_000).getUTCDay()];
      return days.includes(weekday);
    }
    case "MONTHLY": {
      if (((y - start.y) * 12 + (m - start.m)) % rule.interval !== 0) return false;
      if (rule.byMonthDay.length) return rule.byMonthDay.some((n) => (n > 0 ? n === d : daysInMonth + n + 1 === d));
      if (rule.byDay.length) {
        return rule.byDay.some((b) => {
          if (b.day !== weekday) return false;
          if (!b.ord) return true;
          const nth = Math.floor((d - 1) / 7) + 1;
          const nthFromEnd = Math.floor((daysInMonth - d) / 7) + 1;
          return b.ord > 0 ? nth === b.ord : nthFromEnd === -b.ord;
        });
      }
      return d === start.d;
    }
    case "YEARLY":
      if ((y - start.y) % rule.interval !== 0) return false;
      if (!rule.byMonth.length && m !== start.m) return false;
      if (rule.byMonthDay.length) return rule.byMonthDay.includes(d);
      return d === start.d;
  }
}

function expand(start: Stamp, durationMs: number, rule: Rule, from: Date, to: Date, skip: Set<number>): BusyWindow[] {
  const out: BusyWindow[] = [];
  let seen = 0;
  const cursor = new Date(Date.UTC(start.wall.y, start.wall.m - 1, start.wall.d));
  for (let i = 0; i < MAX_DAYS_EXPANDED; i++, cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const [y, m, d] = [cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()];
    if (!matchesRule(rule, start.wall, y, m, d)) continue;
    const at = start.allDay
      ? zonedWallToUtc(y, m, d, 0, 0, 0, start.zone)
      : zonedWallToUtc(y, m, d, start.wall.h, start.wall.mi, start.wall.s, start.zone);
    if (at.getTime() < start.at.getTime()) continue;
    if (rule.until && at.getTime() > rule.until.getTime()) break;
    seen++;
    if (rule.count != null && seen > rule.count) break;
    if (at.getTime() >= to.getTime()) break;
    const end = new Date(at.getTime() + durationMs);
    if (end.getTime() > from.getTime() && !skip.has(at.getTime())) out.push({ start: at, end });
  }
  return out;
}

/** Busy time on the calendar between `from` and `to`. Free (transparent) and cancelled events don't count. */
export function parseBusyWindows(ics: string, options: { from: Date; to: Date; timezone: string }): BusyWindow[] {
  const zone = isValidTimezone(options.timezone) ? options.timezone : "America/New_York";
  const raw = events(ics);
  const get = (e: RawEvent, name: string) => e.find((p) => p.name === name);

  const overridden = new Map<string, Set<number>>();
  for (const e of raw) {
    const rid = get(e, "RECURRENCE-ID");
    const uid = get(e, "UID")?.value;
    const at = rid && parseStamp(rid.value, rid.params, zone)?.at;
    if (uid && at) {
      if (!overridden.has(uid)) overridden.set(uid, new Set());
      overridden.get(uid)!.add(at.getTime());
    }
  }

  const out: BusyWindow[] = [];
  for (const e of raw) {
    if (get(e, "TRANSP")?.value.toUpperCase() === "TRANSPARENT") continue;
    if (get(e, "STATUS")?.value.toUpperCase() === "CANCELLED") continue;
    const dt = get(e, "DTSTART");
    const start = dt && parseStamp(dt.value, dt.params, zone);
    if (!start) continue;

    const dtEnd = get(e, "DTEND");
    const endStamp = dtEnd && parseStamp(dtEnd.value, dtEnd.params, zone);
    const dur = get(e, "DURATION");
    const durationMs = endStamp
      ? endStamp.at.getTime() - start.at.getTime()
      : dur
        ? parseDurationMs(dur.value)
        : start.allDay
          ? 86_400_000
          : 0;
    if (!durationMs || durationMs <= 0) continue;

    const rruleProp = get(e, "RRULE");
    const rule = rruleProp && !get(e, "RECURRENCE-ID") ? parseRule(rruleProp.value, zone) : null;
    if (rule) {
      const skip = new Set(overridden.get(get(e, "UID")?.value ?? "") ?? []);
      for (const ex of e.filter((p) => p.name === "EXDATE")) {
        for (const v of ex.value.split(",")) {
          const at = parseStamp(v, ex.params, zone)?.at;
          if (at) skip.add(at.getTime());
        }
      }
      out.push(...expand(start, durationMs, rule, options.from, options.to, skip));
    } else {
      const end = new Date(start.at.getTime() + durationMs);
      if (start.at < options.to && end > options.from) out.push({ start: start.at, end });
    }
    if (out.length >= MAX_WINDOWS) break;
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, MAX_WINDOWS);
}

export async function fetchBusyCalendar(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const checked = normalizeBusyCalendarUrl(url);
  if (!checked.ok) throw new Error(checked.error);
  const res = await fetchImpl(checked.url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "text/calendar, text/plain;q=0.5" },
    cache: "no-store",
  });
  if (res.url && !normalizeBusyCalendarUrl(res.url).ok) throw new Error("Calendar redirected somewhere unexpected");
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    throw new Error("The calendar address no longer works. It may have been reset — paste the new secret address.");
  }
  if (!res.ok) throw new Error(`Calendar returned ${res.status}`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("Calendar is too large to read");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("Calendar is too large to read");
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That address didn't return a calendar. Use the secret address in iCal format.");
  return text;
}

type StoredWindow = [number, number];

function encode(windows: BusyWindow[]) {
  return JSON.stringify(windows.map((w): StoredWindow => [w.start.getTime(), w.end.getTime()]));
}

function decode(json: string | null | undefined): BusyWindow[] {
  if (!json) return [];
  try {
    return (JSON.parse(json) as StoredWindow[]).map(([s, e]) => ({ start: new Date(s), end: new Date(e) }));
  } catch {
    return [];
  }
}

type BusyBusiness = Pick<
  Business,
  "id" | "timezone" | "busyCalendarUrl" | "busyCalendarJson" | "busyCalendarSyncedAt"
>;

/** Pull the calendar now and store its busy times. Keeps the last good copy when a pull fails. */
export async function refreshBusyCalendar(business: BusyBusiness, now = new Date(), fetchImpl?: typeof fetch) {
  if (!business.busyCalendarUrl) return { windows: [] as BusyWindow[], error: null };
  try {
    const ics = await fetchBusyCalendar(business.busyCalendarUrl, fetchImpl);
    const windows = parseBusyWindows(ics, { from: now, to: new Date(now.getTime() + HORIZON_MS), timezone: business.timezone });
    await prisma.business.update({
      where: { id: business.id },
      data: { busyCalendarJson: encode(windows), busyCalendarSyncedAt: now, busyCalendarError: null },
    });
    return { windows, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn("busy_calendar.refresh_failed", { businessId: business.id, error: message });
    await prisma.business
      .update({ where: { id: business.id }, data: { busyCalendarError: message.slice(0, 280) } })
      .catch(() => undefined);
    return { windows: decode(business.busyCalendarJson), error: message };
  }
}

/** Busy times to block when offering slots, refreshed when the stored copy is older than ten minutes. */
export async function getBusyWindows(businessId: string, now = new Date()): Promise<BusyWindow[]> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, timezone: true, busyCalendarUrl: true, busyCalendarJson: true, busyCalendarSyncedAt: true },
  });
  if (!business?.busyCalendarUrl) return [];
  const fresh = business.busyCalendarSyncedAt && now.getTime() - business.busyCalendarSyncedAt.getTime() < BUSY_REFRESH_MS;
  const windows = fresh ? decode(business.busyCalendarJson) : (await refreshBusyCalendar(business, now)).windows;
  return windows.filter((w) => w.end.getTime() > now.getTime());
}
