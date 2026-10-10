import { safeTimezone, shopDayBounds, type BusyWindow } from "@/lib/availability";

/**
 * Days the whole shop is closed — holidays, a training day, the week off.
 * Stored on Business.closedDatesJson as shop-local calendar days, because a
 * holiday is a date on the wall calendar, not a span of UTC.
 */
export type ShopClosure = { date: string; label: string };

export const MAX_CLOSURES = 60;
const LABEL_MAX = 40;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDay(value: string) {
  const m = DAY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(y, mo - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d;
}

/** Sorted, de-duplicated, valid closures. Anything malformed is dropped, never thrown. */
export function parseClosures(raw: string | null | undefined): ShopClosure[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const byDate = new Map<string, ShopClosure>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const date = String((item as { date?: unknown }).date ?? "");
    if (!validDay(date)) continue;
    const label = String((item as { label?: unknown }).label ?? "").trim().slice(0, LABEL_MAX) || "Closed";
    byDate.set(date, { date, label });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type ClosuresCheck = { ok: true; json: string } | { ok: false; error: string };

/** What the settings API stores: strict, so a bad request is refused rather than silently trimmed. */
export function validateClosures(raw: string): ClosuresCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Days closed couldn't be read. Refresh and try again." };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "Days closed couldn't be read. Refresh and try again." };
  for (const item of parsed) {
    const date = String((item as { date?: unknown })?.date ?? "");
    if (!validDay(date)) return { ok: false, error: `“${date || "blank"}” isn't a date. Pick it from the calendar.` };
  }
  const closures = parseClosures(raw);
  if (closures.length > MAX_CLOSURES) {
    return { ok: false, error: `Up to ${MAX_CLOSURES} days closed. Remove past ones first.` };
  }
  return { ok: true, json: JSON.stringify(closures) };
}

/** The shop's calendar day for an instant, as YYYY-MM-DD. */
export function shopDay(at: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function isClosedDay(at: Date, closures: ShopClosure[], timezone: string) {
  if (!closures.length) return false;
  const day = shopDay(at, timezone);
  return closures.some((c) => c.date === day);
}

/** Closures from today on (in the shop's zone). */
export function upcomingClosures(closures: ShopClosure[], timezone: string, now = new Date()) {
  const today = shopDay(now, timezone);
  return closures.filter((c) => c.date >= today);
}

/** Each closed day as a whole-day block, so booking treats it like a full calendar. */
export function closureWindows(closures: ShopClosure[], timezone: string, now = new Date()): BusyWindow[] {
  return upcomingClosures(closures, timezone, now).map((c) => {
    const { start, end } = shopDayBounds(c.date, timezone);
    return { start, end };
  });
}

function formatDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function closureDayLabel(date: string) {
  return formatDay(date);
}

/** For the receptionist: the next closures, so a caller hears "we're closed Thursday for Thanksgiving". */
export function formatClosuresForPrompt(raw: string | null | undefined, timezone: string, now = new Date()) {
  const upcoming = upcomingClosures(parseClosures(raw), timezone, now).slice(0, 12);
  if (!upcoming.length) return "";
  const lines = upcoming.map((c) => `- ${formatDay(c.date)}, ${c.date.slice(0, 4)}: ${c.label}`).join("\n");
  return `\n\nDAYS CLOSED\nThe shop is closed all day on these dates, on top of the weekly hours:\n${lines}\nOn a closed day, treat every call like after hours: take the message and mark urgency, and emergencies still get priority callback. Never offer a time on a closed day; check_availability already skips them.`;
}

function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

function lastWeekday(year: number, month: number, weekday: number) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, days)).getUTCDay();
  return days - ((last - weekday + 7) % 7);
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The holidays most trade shops close for, by actual date (no observed-day shifting). */
export function usHolidays(year: number): ShopClosure[] {
  return [
    { date: iso(year, 1, 1), label: "New Year's Day" },
    { date: iso(year, 5, lastWeekday(year, 5, 1)), label: "Memorial Day" },
    { date: iso(year, 7, 4), label: "Independence Day" },
    { date: iso(year, 9, nthWeekday(year, 9, 1, 1)), label: "Labor Day" },
    { date: iso(year, 11, nthWeekday(year, 11, 4, 4)), label: "Thanksgiving" },
    { date: iso(year, 12, 24), label: "Christmas Eve" },
    { date: iso(year, 12, 25), label: "Christmas Day" },
    { date: iso(year, 12, 31), label: "New Year's Eve" },
  ];
}

/** Holidays in the next year the shop hasn't marked yet, soonest first. */
export function suggestedHolidays(closures: ShopClosure[], timezone: string, now = new Date(), limit = 4) {
  const today = shopDay(now, timezone);
  const year = Number(today.slice(0, 4));
  const marked = new Set(closures.map((c) => c.date));
  const horizon = iso(year + 1, Number(today.slice(5, 7)), Number(today.slice(8, 10)));
  return [...usHolidays(year), ...usHolidays(year + 1)]
    .filter((h) => h.date >= today && h.date < horizon && !marked.has(h.date))
    .slice(0, limit);
}

/** US zones a shop is most likely in, then whatever the shop already has. */
export const US_TIMEZONES: Array<{ id: string; label: string }> = [
  { id: "America/New_York", label: "Eastern" },
  { id: "America/Chicago", label: "Central" },
  { id: "America/Denver", label: "Mountain" },
  { id: "America/Phoenix", label: "Arizona (no daylight saving)" },
  { id: "America/Los_Angeles", label: "Pacific" },
  { id: "America/Anchorage", label: "Alaska" },
  { id: "Pacific/Honolulu", label: "Hawaii" },
  { id: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
];

export function timezoneLabel(id: string) {
  return US_TIMEZONES.find((z) => z.id === id)?.label ?? id.replace(/_/g, " ");
}
