"use client";

export const STATUS_WORD: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  en_route: "On the way",
  on_site: "On site",
  completed: "Done",
  cancelled: "Cancelled",
};

export function StatusPill({ status, urgency }: { status: string; urgency?: string | null }) {
  const emergency = /emergency/i.test(urgency ?? "") && status !== "completed";
  const tone = emergency ? "risk" : status === "completed" ? "done" : status === "en_route" || status === "on_site" ? "live" : "plain";
  return <span className={`ta-pill ta-pill--${tone}`}>{emergency ? "Emergency" : (STATUS_WORD[status] ?? status)}</span>;
}

export function phoneLabel(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

/** Times on the shop's clock: the technician's phone may sit in another zone. */
export function timeLabel(iso: string | null, timeZone: string) {
  if (!iso) return "No time set";
  return new Date(iso).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

export function whenLabel(iso: string | null, timeZone: string, now = new Date()) {
  if (!iso) return "No time set";
  const d = new Date(iso);
  const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const time = timeLabel(iso, timeZone);
  if (day(d) === day(now)) return `Today · ${time}`;
  if (day(d) === day(new Date(now.getTime() + 86_400_000))) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}

export function money(cents: number | null | undefined) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

export function directionsUrl(address: string) {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

export async function techFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}
