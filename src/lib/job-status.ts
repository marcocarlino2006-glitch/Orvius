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
