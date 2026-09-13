import { parseJson, type BusinessHours } from "@/lib/business";

export const DEFAULT_JOB_DURATION_MIN = 120;
export const SLOT_STEP_MIN = 30;
export const MAX_SCHEDULE_DAYS = 14;

type Urgency = string | null | undefined;

type ExistingWindow = {
  scheduledAt: Date;
  durationMin?: number | null;
};

type AvailabilityInput = {
  now?: Date;
  urgency?: Urgency;
  hoursJson: string;
  timezone: string;
  existing: ExistingWindow[];
  capacity: number;
  durationMin?: number;
};

type LocalClock = {
  weekday: string;
  hour: number;
  minute: number;
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const FALLBACK_HOURS: BusinessHours = {
  monday: { open: "08:00", close: "17:00" },
  tuesday: { open: "08:00", close: "17:00" },
  wednesday: { open: "08:00", close: "17:00" },
  thursday: { open: "08:00", close: "17:00" },
  friday: { open: "08:00", close: "17:00" },
  saturday: { open: "00:00", close: "00:00", closed: true },
  sunday: { open: "00:00", close: "00:00", closed: true },
};

function parseMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function localClock(at: Date, timezone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(at);

  const weekday = (
    parts.find((part) => part.type === "weekday")?.value ?? "monday"
  ).toLowerCase();
  let hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  if (hour === 24) hour = 0;
  return { weekday, hour, minute };
}

function safeTimezone(timezone: string) {
  try {
    // Throws for an invalid IANA identifier.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "America/New_York";
  }
}

function configuredHours(hoursJson: string) {
  const parsed = parseJson<BusinessHours>(hoursJson, {});
  return Object.keys(parsed).length ? parsed : FALLBACK_HOURS;
}

/**
 * Whether a complete service window fits inside one configured shop day.
 * We do not merely test the start: a 4:30 appointment at a 5pm shop is not
 * available if the job normally takes two hours.
 */
export function fitsShopHours(input: {
  start: Date;
  durationMin: number;
  hoursJson: string;
  timezone: string;
}) {
  const timezone = safeTimezone(input.timezone);
  const clock = localClock(input.start, timezone);
  const hours = configuredHours(input.hoursJson);
  const entry = hours[clock.weekday];
  if (!entry || entry.closed) return false;

  const open = parseMinutes(entry.open);
  const close = parseMinutes(entry.close);
  if (open == null || close == null || close <= open) {
    // Overnight windows are valid for phone coverage, but field scheduling
    // needs an explicit on-call model before it can promise overnight work.
    return false;
  }

  const start = clock.hour * 60 + clock.minute;
  return start >= open && start + input.durationMin <= close;
}

function minimumLeadMinutes(urgency: Urgency) {
  const key = urgency?.toLowerCase().replace(/\s+/g, "-") ?? "";
  if (key.includes("emergency")) return 30;
  if (
    key.includes("same-day") ||
    key.includes("same_day") ||
    key === "today"
  ) {
    return 60;
  }
  if (key.includes("this-week") || key.includes("week")) return 12 * 60;
  return 24 * 60;
}

function roundUp(at: Date, stepMin: number) {
  const stepMs = stepMin * 60_000;
  return new Date(Math.ceil(at.getTime() / stepMs) * stepMs);
}

export function overlappingJobs(input: {
  start: Date;
  durationMin: number;
  existing: ExistingWindow[];
}) {
  const startMs = input.start.getTime();
  const endMs = startMs + input.durationMin * 60_000;

  return input.existing.filter((window) => {
    const otherStart = window.scheduledAt.getTime();
    const otherDuration = Math.max(
      SLOT_STEP_MIN,
      window.durationMin ?? DEFAULT_JOB_DURATION_MIN,
    );
    const otherEnd = otherStart + otherDuration * 60_000;
    return startMs < otherEnd && otherStart < endMs;
  }).length;
}

/**
 * Earliest proposed window the shop can actually carry.
 *
 * This is intentionally deterministic rather than "AI": availability is a
 * safety invariant, not a language task. It respects the shop's timezone and
 * hours, requires the whole job to fit, and never schedules more concurrent
 * work than active technicians. The customer still confirms the proposal.
 */
export function findAvailableSchedule(input: AvailabilityInput): Date | null {
  const now = input.now ?? new Date();
  const durationMin = Math.max(
    SLOT_STEP_MIN,
    input.durationMin ?? DEFAULT_JOB_DURATION_MIN,
  );
  const capacity = Math.max(1, Math.floor(input.capacity));
  const earliest = roundUp(
    new Date(now.getTime() + minimumLeadMinutes(input.urgency) * 60_000),
    SLOT_STEP_MIN,
  );
  const deadline = now.getTime() + MAX_SCHEDULE_DAYS * 24 * 60 * 60_000;

  for (
    let candidate = earliest;
    candidate.getTime() <= deadline;
    candidate = new Date(candidate.getTime() + SLOT_STEP_MIN * 60_000)
  ) {
    if (
      !fitsShopHours({
        start: candidate,
        durationMin,
        hoursJson: input.hoursJson,
        timezone: input.timezone,
      })
    ) {
      continue;
    }

    if (
      overlappingJobs({
        start: candidate,
        durationMin,
        existing: input.existing,
      }) < capacity
    ) {
      return candidate;
    }
  }

  return null;
}

/** Stable local rendering for logs, alerts, and tests. */
export function formatShopTime(at: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone(timezone),
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(at);
}
