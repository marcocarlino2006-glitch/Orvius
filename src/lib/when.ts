/** "Sep 25, 5:53 AM" — the year only when it is not this one, never seconds. Pass the shop's timezone to read it on the shop's clock. */
export function formatWhen(value: Date | string | number | null | undefined, now = new Date(), timezone?: string | null): string {
  if (value == null) return "";
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

/** "Wednesday, October 7 at 11:30 AM CDT" — read on the shop's clock, wherever the viewer is. */
export function formatShopTime(value: Date | string | null | undefined, timezone: string | null | undefined): string {
  if (value == null) return "";
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

/** The value for a datetime-local input showing `value` on the shop's clock. */
export function shopWallInput(value: Date | string | null | undefined, timezone: string | null | undefined): string {
  if (value == null) return "";
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timezone ? { timeZone: timezone } : {}),
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** "Sep 25" or "Sep 25, 2025" — for days, not moments. */
export function formatDay(value: Date | string | number | null | undefined, now = new Date()): string {
  if (value == null) return "";
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** "en_route" → "En route". */
export function statusWord(status: string | null | undefined): string {
  if (!status) return "";
  const words = status.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "stripe:cs_live_…" → "Paid by card"; "check" → "Paid by check". Never prints a processor id. */
export function paymentMethodLabel(method: string | null | undefined): string {
  const m = method?.trim().toLowerCase() ?? "";
  if (!m) return "Recorded payment";
  if (m.startsWith("stripe") || m === "card") return "Paid by card";
  if (m === "ach" || m === "bank") return "Paid by bank transfer";
  return `Paid by ${m.replace(/[_-]+/g, " ")}`;
}
