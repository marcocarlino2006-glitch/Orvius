/**
 * The six states a job moves through, in the owner's words.
 *
 * A technician tapping "done" reports completion; it does not close the job.
 * A job closes when the outcome is written down (what was done, what it cost)
 * or when it was cancelled. Nothing here is labelled verified: Orvius has no
 * way to see the work, only what someone reported about it.
 */
export const JOB_STATES = [
  "awaiting_confirmation",
  "confirmed",
  "assigned",
  "in_progress",
  "completion_reported",
  "closed",
] as const;

export type JobState = (typeof JOB_STATES)[number];

export const JOB_STATE_LABEL: Record<JobState, string> = {
  awaiting_confirmation: "Awaiting confirmation",
  confirmed: "Confirmed",
  assigned: "Assigned",
  in_progress: "In progress",
  completion_reported: "Completion reported",
  closed: "Closed",
};

export type JobLifecycleInput = {
  status: string;
  customerConfirmedAt?: string | Date | null;
  technician?: { name: string } | null;
  outcomeCapturedAt?: string | Date | null;
  resolutionCode?: string | null;
};

export type JobLifecycle = {
  state: JobState;
  label: string;
  /** One line on why it is in this state and what moves it on. */
  detail: string;
  tone: "live" | "good" | "neutral" | "muted" | "attention";
};

export function jobLifecycle(job: JobLifecycleInput): JobLifecycle {
  const tech = job.technician?.name ?? null;
  const make = (state: JobState, detail: string, tone: JobLifecycle["tone"]): JobLifecycle => ({
    state,
    label: JOB_STATE_LABEL[state],
    detail,
    tone,
  });

  if (job.status === "cancelled") return make("closed", "Cancelled", "muted");
  if (job.status === "completed") {
    return job.outcomeCapturedAt || job.resolutionCode
      ? make("closed", "Outcome recorded", "good")
      : make("completion_reported", "Marked done. Record the outcome to close it.", "attention");
  }
  if (job.status === "en_route") return make("in_progress", tech ? `${tech} is on the way` : "On the way", "live");
  if (job.status === "on_site") return make("in_progress", tech ? `${tech} is on site` : "On site", "live");

  const confirmed = job.status === "confirmed" || Boolean(job.customerConfirmedAt);
  if (!confirmed) {
    return make(
      "awaiting_confirmation",
      tech ? `${tech} is lined up · waiting on the customer` : "Waiting on the customer to confirm the time",
      "attention",
    );
  }
  if (!tech) return make("confirmed", "Customer confirmed · nobody assigned yet", "attention");
  return make("assigned", `${tech} is going`, "neutral");
}

/** "9:00–10:30 AM" on the shop's clock, or null with no time set. */
export function appointmentWindow(
  scheduledAt: string | Date | null | undefined,
  durationMin: number | null | undefined,
  timeZone?: string,
): string | null {
  if (!scheduledAt) return null;
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + (durationMin && durationMin > 0 ? durationMin : 60) * 60_000);
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  const a = fmt(start);
  const b = fmt(end);
  const [aTime, aMer] = a.split(" ");
  const [, bMer] = b.split(" ");
  return aMer === bMer ? `${aTime}–${b}` : `${a}–${b}`;
}
