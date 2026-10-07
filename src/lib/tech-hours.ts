import { parseJson, type BusinessHours } from "@/lib/business";
import {
  DEFAULT_JOB_DURATION_MIN,
  SLOT_STEP_MIN,
  fitsShopHours,
  type BusyWindow,
} from "@/lib/availability";

export type TechShift = {
  id: string;
  hoursJson?: string | null;
  timeOff?: BusyWindow[];
};

export type Unavailable = "time_off" | "off_shift";

/** A technician with no hours of their own works whenever the shop is open. */
export function hasOwnHours(hoursJson: string | null | undefined): boolean {
  return Object.keys(parseJson<BusinessHours>(hoursJson ?? "", {})).length > 0;
}

/**
 * Why this technician cannot take a job at this time, or null when they can.
 * Shop hours are checked by the slot search itself; this only narrows them.
 */
export function techUnavailable(
  tech: TechShift,
  start: Date,
  durationMin: number,
  timezone: string,
): Unavailable | null {
  const startMs = start.getTime();
  const endMs = startMs + durationMin * 60_000;
  if (tech.timeOff?.some((t) => startMs < t.end.getTime() && t.start.getTime() < endMs)) return "time_off";
  if (hasOwnHours(tech.hoursJson) && !fitsShopHours({ start, durationMin, hoursJson: tech.hoursJson!, timezone })) {
    return "off_shift";
  }
  return null;
}

type BookedWindow = { scheduledAt: Date; durationMin?: number | null; technicianId?: string | null };

/**
 * Whether one more job fits at this time. Room is the technicians on shift
 * and not on time off; it is used up by their own jobs and by unassigned work
 * (which could land on any of them). A shop with no technicians on the books
 * is the owner working alone, so it carries one job at a time.
 */
export function slotHasRoom(input: {
  pool: TechShift[];
  booked: BookedWindow[];
  start: Date;
  durationMin: number;
  timezone: string;
}): boolean {
  const startMs = input.start.getTime();
  const endMs = startMs + input.durationMin * 60_000;
  const overlapping = input.booked.filter((w) => {
    const otherStart = w.scheduledAt.getTime();
    const otherEnd = otherStart + Math.max(SLOT_STEP_MIN, w.durationMin ?? DEFAULT_JOB_DURATION_MIN) * 60_000;
    return startMs < otherEnd && otherStart < endMs;
  });
  if (!input.pool.length) return overlapping.length < 1;
  const working = new Set(
    input.pool.filter((t) => !techUnavailable(t, input.start, input.durationMin, input.timezone)).map((t) => t.id),
  );
  const used = overlapping.filter((w) => !w.technicianId || working.has(w.technicianId)).length;
  return used < working.size;
}

export function unavailableWords(name: string, why: Unavailable): string {
  return why === "time_off" ? `${name} is off that day` : `${name} isn't working then`;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validated hours for all seven days, or null when any working day is malformed or ends before it starts. */
export function parseTechHours(raw: unknown): BusinessHours | null {
  if (!raw || typeof raw !== "object") return null;
  const out: BusinessHours = {};
  for (const day of DAYS) {
    const entry = (raw as Record<string, unknown>)[day] as { open?: unknown; close?: unknown; closed?: unknown } | undefined;
    if (!entry || entry.closed === true) {
      out[day] = { open: "00:00", close: "00:00", closed: true };
      continue;
    }
    const open = typeof entry.open === "string" ? entry.open : "";
    const close = typeof entry.close === "string" ? entry.close : "";
    if (!HHMM.test(open) || !HHMM.test(close) || close <= open) return null;
    out[day] = { open, close };
  }
  return out;
}
