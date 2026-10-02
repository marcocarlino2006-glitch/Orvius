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

export function jobStatusLabel(status: string) {
  return status.replace(/_/g, " ");
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
