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
      return { label: "Confirm", status: "confirmed" };
    case "confirmed":
      return { label: "En route", status: "en_route" };
    case "en_route":
      return { label: "On site", status: "on_site" };
    case "on_site":
      return { label: "Complete", status: "completed" };
    default:
      return null;
  }
}
