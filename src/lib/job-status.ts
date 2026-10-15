export const JOB_STATUSES = [
  "scheduled",
  "confirmed",
  "en_route",
  "on_site",
  "completed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export function isJobStatus(value: string): value is JobStatus {
  return JOB_STATUSES.includes(value as JobStatus);
}

const STATUS_WORDS: Record<string, string> = {
  en_route: "on the way",
  on_site: "on site",
  completed: "done",
};

/** "en_route" → "on the way": the words the owner and the technician use. */
export function jobStatusLabel(status: string) {
  return STATUS_WORDS[status] ?? status.replace(/_/g, " ");
}

/** "On the way", for the start of a line. */
export function jobStatusTitle(status: string) {
  const word = jobStatusLabel(status);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The visit time passed and nobody started the job. Confirming it or sending
 * a tech now is the wrong next step; the owner has to decide what happened:
 * contact the customer, move it to a new time, or close it.
 */
export const PAST_DUE_GRACE_MS = 60 * 60 * 1000;

export function jobPastDue(
  job: { status: string; scheduledAt: Date | string | null | undefined },
  now = Date.now(),
): boolean {
  if (job.status !== "scheduled" && job.status !== "confirmed") return false;
  if (!job.scheduledAt) return false;
  return new Date(job.scheduledAt).getTime() + PAST_DUE_GRACE_MS < now;
}

export const PAST_DUE_LABEL = "Contact, reschedule or close";

export function pastDueDetail(scheduledAt: Date | string, now = Date.now()): string {
  const hours = Math.max(1, Math.round((now - new Date(scheduledAt).getTime()) / 3_600_000));
  const ago = hours < 48 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${Math.round(hours / 24)} days`;
  return `The visit was due ${ago} ago and never started. Call the customer, move it to a new time, or close it.`;
}

/** Next actionable status for the field loop — null when terminal. */
export function nextJobStatus(
  status: string,
): { label: string; status: JobStatus } | null {
  switch (status) {
    case "scheduled":
      return { label: "Mark confirmed", status: "confirmed" };
    case "confirmed":
      return { label: "On the way", status: "en_route" };
    case "en_route":
      return { label: "Arrived", status: "on_site" };
    case "on_site":
      return { label: "Mark done", status: "completed" };
    default:
      return null;
  }
}

/**
 * The one rule for moving a job between statuses, applied wherever a status
 * is written. Skipping steps is fine (a job can go straight from booked to
 * done) and so is reopening. What it refuses is a move that would make the
 * record lie: a cancelled job "done" without being reopened, or a job with a
 * paid invoice cancelled out from under the payment.
 */
export function jobTransitionProblem(from: string, to: JobStatus, ctx: { paidInvoice: boolean }): string | null {
  if (from === to) return null;
  if (from === "cancelled" && to === "completed") return "This job was cancelled. Reopen it before marking it done.";
  if (to === "cancelled" && ctx.paidInvoice) {
    return "This job has a paid invoice, so it can't be cancelled — that would leave the payment on nothing. Mark it done, or refund the payment first.";
  }
  return null;
}
