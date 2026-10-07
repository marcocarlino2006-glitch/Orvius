export type TimesheetJob = {
  id: string;
  title: string;
  technicianId: string | null;
  technicianName: string | null;
  dispatchedAt: Date | string | null;
  onSiteAt: Date | string | null;
  completedAt: Date | string | null;
  durationMin: number | null;
  status: string;
};

export type TimesheetLane = {
  technicianId: string;
  name: string;
  minutes: number;
  jobs: Array<{ id: string; title: string; minutes: number; status: string }>;
};

function at(value: Date | string | null | undefined) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Minutes on site, then en route, then the booked length once the job is done. */
export function visitMinutes(job: TimesheetJob) {
  const start = at(job.onSiteAt) ?? at(job.dispatchedAt);
  const end = at(job.completedAt);
  if (start && end && end > start) return Math.round((end.getTime() - start.getTime()) / 60_000);
  if (job.status === "completed" && job.durationMin && job.durationMin > 0) return job.durationMin;
  return 0;
}

export function buildTimesheet(jobs: TimesheetJob[]): TimesheetLane[] {
  const lanes = new Map<string, TimesheetLane>();
  for (const job of jobs) {
    const minutes = visitMinutes(job);
    if (!minutes || !job.technicianId) continue;
    const lane = lanes.get(job.technicianId) ?? {
      technicianId: job.technicianId,
      name: job.technicianName ?? "Technician",
      minutes: 0,
      jobs: [],
    };
    lane.minutes += minutes;
    lane.jobs.push({ id: job.id, title: job.title, minutes, status: job.status });
    lanes.set(job.technicianId, lane);
  }
  return [...lanes.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
}

/** Monday 00:00 UTC through the following Monday, from a YYYY-MM-DD shop day. */
export function weekBounds(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12));
  const dow = date.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - back);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

export function formatHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}
