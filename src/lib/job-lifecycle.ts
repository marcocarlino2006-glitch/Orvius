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
  technician?: { name: string; phone?: string | null } | null;
  outcomeCapturedAt?: string | Date | null;
  resolutionCode?: string | null;
  techAcceptedAt?: string | Date | null;
  techDeclinedAt?: string | Date | null;
  techDeclinedBy?: string | null;
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
  const accepted = Boolean(job.techAcceptedAt);
  const declined = !tech && job.techDeclinedAt ? `${job.techDeclinedBy ?? "The technician"} can't take it` : null;
  if (!confirmed) {
    return make(
      "awaiting_confirmation",
      tech
        ? `${tech} ${accepted ? "accepted" : "assigned, hasn't accepted yet"} · waiting on the customer`
        : declined
          ? `${declined} · assign someone else`
          : "Waiting on the customer to confirm the time",
      "attention",
    );
  }
  if (!tech) return make("confirmed", declined ? `Customer confirmed · ${declined}, assign someone else` : "Customer confirmed · nobody assigned yet", "attention");
  if (!accepted) return make("assigned", `${tech} hasn't accepted yet`, "attention");
  return make("assigned", `${tech} accepted · going`, "neutral");
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

export type JobStepState = "done" | "waiting" | "problem";

export type JobStep = {
  key: "booked" | "customer" | "technician" | "en_route" | "on_site" | "done";
  label: string;
  state: JobStepState;
  /** What the record shows, in the owner's words; never a step that hasn't happened. */
  detail: string;
  at: string | null;
};

export type JobStepsInput = JobLifecycleInput & {
  createdAt: string | Date;
  scheduledAt?: string | Date | null;
  customerConfirmSentAt?: string | Date | null;
  customerConfirmFailedAt?: string | Date | null;
  /** What the carrier last reported for the confirm text; absent when the caller didn't look it up. */
  customerConfirmDelivery?: TextDelivery | null;
  techAssignedAt?: string | Date | null;
  techNotifiedAt?: string | Date | null;
  techDeclineReason?: string | null;
  dispatchedAt?: string | Date | null;
  onSiteAt?: string | Date | null;
  completedAt?: string | Date | null;
};

export type TextDelivery = "delivered" | "simulated" | "pending" | "unknown" | "failed";

/** A carrier receipt this long overdue means nobody knows whether the text arrived. */
export const RECEIPT_OVERDUE_MS = 30 * 60_000;

/**
 * Twilio taking a text is not the customer getting it. Only a "delivered"
 * receipt says it arrived; a demo text is simulated, never delivered.
 */
export function textDelivery(
  text: { sid: string | null | undefined; deliveryStatus: string | null | undefined; sentAt: string | Date | null | undefined },
  now = new Date(),
): TextDelivery {
  if (text.sid?.startsWith("SIM_")) return "simulated";
  const status = text.deliveryStatus?.toLowerCase() ?? null;
  if (status === "delivered" || status === "read") return "delivered";
  if (status === "failed" || status === "undelivered") return "failed";
  const sentAt = text.sentAt ? new Date(text.sentAt).getTime() : null;
  return sentAt != null && now.getTime() - sentAt > RECEIPT_OVERDUE_MS ? "unknown" : "pending";
}

const CONFIRM_SENT_DETAIL: Record<Exclude<TextDelivery, "failed">, string> = {
  delivered: "Confirm text delivered, no reply yet",
  simulated: "Confirm text simulated (demo), no reply yet",
  pending: "Confirm text handed to the carrier, delivery not reported yet",
  unknown: "No delivery receipt for the confirm text. Call if the time matters.",
};

/* A job text that Twilio hasn't taken a couple of minutes after assigning did not go out. */
const NOTIFY_GRACE_MS = 2 * 60_000;

const iso = (at: string | Date | null | undefined) => (at ? new Date(at).toISOString() : null);

/**
 * The visit as separate facts, each read from its own field: booked, the
 * customer's yes, the technician's yes, on the way, on site, done. A later
 * step never fills in an earlier one; a technician who rolled without
 * tapping accept shows as having started, not as having accepted.
 */
export function jobSteps(job: JobStepsInput, now = new Date()): JobStep[] {
  const tech = job.technician?.name ?? null;
  const started = Boolean(job.dispatchedAt || job.onSiteAt || job.completedAt) || ["en_route", "on_site", "completed"].includes(job.status);
  const steps: JobStep[] = [
    { key: "booked", label: "Booked", state: "done", detail: job.scheduledAt ? "On the schedule" : "Booked, no time set yet", at: iso(job.createdAt) },
  ];

  if (job.customerConfirmedAt) {
    steps.push({ key: "customer", label: "Customer confirmed", state: "done", detail: "They confirmed the time", at: iso(job.customerConfirmedAt) });
  } else if (job.status === "confirmed") {
    steps.push({ key: "customer", label: "Customer confirmed", state: "done", detail: "Marked confirmed by your team", at: null });
  } else if (job.customerConfirmFailedAt) {
    steps.push({ key: "customer", label: "Customer confirmed", state: "problem", detail: "The confirm text didn't go through. Call them.", at: iso(job.customerConfirmFailedAt) });
  } else if (job.customerConfirmSentAt) {
    const delivery = job.customerConfirmDelivery ?? null;
    const detail =
      delivery && delivery !== "failed" ? CONFIRM_SENT_DETAIL[delivery] : "Confirm text sent, delivery not reported";
    steps.push({ key: "customer", label: "Customer confirmed", state: delivery === "failed" ? "problem" : "waiting", detail: delivery === "failed" ? "The confirm text didn't go through. Call them." : detail, at: iso(job.customerConfirmSentAt) });
  } else {
    steps.push({ key: "customer", label: "Customer confirmed", state: "waiting", detail: started ? "Never confirmed" : "Not asked yet", at: null });
  }

  if (job.techAcceptedAt && tech) {
    steps.push({ key: "technician", label: "Technician accepted", state: "done", detail: `${tech} accepted`, at: iso(job.techAcceptedAt) });
  } else if (tech && started) {
    steps.push({ key: "technician", label: "Technician accepted", state: "done", detail: `${tech} started without tapping accept`, at: null });
  } else if (tech) {
    const assignedAt = job.techAssignedAt ? new Date(job.techAssignedAt).getTime() : null;
    const textMissing = assignedAt != null && !job.techNotifiedAt && now.getTime() - assignedAt > NOTIFY_GRACE_MS;
    const noNumber = !job.technician?.phone?.trim();
    steps.push(
      textMissing
        ? {
            key: "technician",
            label: "Technician accepted",
            state: "problem",
            detail: noNumber ? `${tech} has no mobile number, so the job text can't go out. Add it in Team.` : `The job text to ${tech} didn't go out. Call them.`,
            at: iso(job.techAssignedAt),
          }
        : { key: "technician", label: "Technician accepted", state: "waiting", detail: `${tech} assigned, hasn't answered yet`, at: iso(job.techAssignedAt) },
    );
  } else if (job.techDeclinedAt) {
    const why = job.techDeclineReason ? ` ("${job.techDeclineReason}")` : "";
    steps.push({ key: "technician", label: "Technician accepted", state: "problem", detail: `${job.techDeclinedBy ?? "The technician"} can't take it${why}. Assign someone else.`, at: iso(job.techDeclinedAt) });
  } else {
    steps.push({ key: "technician", label: "Technician accepted", state: "waiting", detail: "Nobody assigned yet", at: null });
  }

  const reached = (at: string | Date | null | undefined, statuses: string[]) => Boolean(at) || statuses.includes(job.status);
  steps.push(
    reached(job.dispatchedAt, ["en_route", "on_site", "completed"])
      ? { key: "en_route", label: "On the way", state: "done", detail: job.dispatchedAt ? `${tech ?? "The technician"} left` : "Skipped straight to arriving", at: iso(job.dispatchedAt) }
      : { key: "en_route", label: "On the way", state: "waiting", detail: "Not yet", at: null },
  );
  steps.push(
    reached(job.onSiteAt, ["on_site", "completed"])
      ? { key: "on_site", label: "On site", state: "done", detail: job.onSiteAt ? "Arrived" : "Arrival wasn't marked", at: iso(job.onSiteAt) }
      : { key: "on_site", label: "On site", state: "waiting", detail: "Not yet", at: null },
  );
  steps.push(
    job.status === "completed"
      ? { key: "done", label: "Done", state: "done", detail: job.outcomeCapturedAt || job.resolutionCode ? "Outcome recorded" : "Marked done, outcome not recorded", at: iso(job.completedAt) }
      : { key: "done", label: "Done", state: "waiting", detail: "Not yet", at: null },
  );
  return steps;
}
