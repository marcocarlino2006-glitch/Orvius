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
