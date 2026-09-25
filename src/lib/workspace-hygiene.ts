/**
 * Rules for telling fixture traffic apart from real customers, and for
 * spotting duplicate jobs. Pure so the cleanup script and tests share them.
 */

const FIXTURE_NAME =
  /\b(e2e|dogfood|fixture|smoke test|load test)\b|\btest caller\b|\bdana caller\b|^test\b/i;

const FIXTURE_NOTE = /\bautomated (dogfood|e2e|smoke) test\b/i;

export function isFictionalPhone(phone: string | null | undefined): boolean {
  const digits = phone?.replace(/\D/g, "") ?? "";
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return false;
  const area = national.slice(0, 3);
  const exchange = national.slice(3, 6);
  const line = Number(national.slice(6));
  if (area === "555") return true;
  // 555-0100 through 555-0199 are reserved for fiction in every area code.
  return exchange === "555" && line >= 100 && line <= 199;
}

export function isFixtureContact(contact: {
  name?: string | null;
  phone?: string | null;
  notes?: string | null;
}): boolean {
  if (contact.name && FIXTURE_NAME.test(contact.name.trim())) return true;
  if (contact.notes && FIXTURE_NOTE.test(contact.notes)) return true;
  return isFictionalPhone(contact.phone);
}

export type JobForDedupe = {
  id: string;
  businessId: string;
  customerId: string | null;
  serviceType: string | null;
  title: string;
  status: string;
  createdAt: Date;
  hasMoney: boolean;
};

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const SETTLED = new Set(["en_route", "on_site", "completed"]);

/**
 * Jobs for the same customer and service opened within a day of an earlier
 * one are retries, not new work. The earliest stays; later copies go, unless
 * money is attached to them or the work already happened.
 */
export function findDuplicateJobs(jobs: JobForDedupe[]): { keep: string; drop: string }[] {
  const groups = new Map<string, JobForDedupe[]>();
  for (const job of jobs) {
    if (!job.customerId) continue;
    const key = `${job.businessId}|${job.customerId}|${(job.serviceType ?? job.title).trim().toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(job);
    groups.set(key, list);
  }

  const pairs: { keep: string; drop: string }[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let anchor = list[0];
    for (const job of list.slice(1)) {
      const close = job.createdAt.getTime() - anchor.createdAt.getTime() <= DUPLICATE_WINDOW_MS;
      if (close && !job.hasMoney && !SETTLED.has(job.status)) {
        pairs.push({ keep: anchor.id, drop: job.id });
      } else {
        anchor = job;
      }
    }
  }
  return pairs;
}

/**
 * Demo schedules drift into the past. Re-date open demo jobs onto the next
 * working days, a few per day at realistic appointment times.
 */
export function realisticDemoSlots(count: number, now = new Date()): Date[] {
  const hours = [8, 10, 13, 15];
  const slots: Date[] = [];
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  while (slots.length < count) {
    day.setDate(day.getDate() + 1);
    const weekday = day.getDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const hour of hours) {
      if (slots.length >= count) break;
      const slot = new Date(day);
      slot.setHours(hour, 0, 0, 0);
      slots.push(slot);
    }
  }
  return slots;
}
