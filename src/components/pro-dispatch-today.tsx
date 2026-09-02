"use client";

import Link from "next/link";
import { jobStatusLabel } from "@/lib/job-status";

type DispatchJob = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  address: string | null;
  urgency: string | null;
  technician?: { name: string } | null;
  customer?: { name: string | null; phone: string } | null;
  lead?: { name: string | null; phone: string | null } | null;
};

type ProDispatchTodayProps = {
  jobs: DispatchJob[];
  unassigned: number;
  jobCount: number;
};

function formatTime(iso: string | null) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ProDispatchToday({ jobs, unassigned, jobCount }: ProDispatchTodayProps) {
  if (jobCount === 0) {
    return (
      <section className="pro-dispatch-today pro-dispatch-today-empty">
        <div className="pro-dispatch-today-head font-sans">
          <p className="pro-dispatch-today-kicker">Today&apos;s schedule</p>
          <p className="pro-dispatch-today-title">Nothing booked yet</p>
        </div>
        <Link href="/dashboard/inbox" className="btn btn-secondary text-sm">
          Book from inbox
        </Link>
      </section>
    );
  }

  return (
    <section className={`pro-dispatch-today ${unassigned > 0 ? "pro-dispatch-today-unassigned" : ""}`}>
      <div className="pro-dispatch-today-head font-sans">
        <div>
          <p className="pro-dispatch-today-kicker">Today&apos;s schedule</p>
          <p className="pro-dispatch-today-title">
            {jobCount} job{jobCount === 1 ? "" : "s"}
            {unassigned > 0 ? (
              <span className="pro-dispatch-today-unassigned-badge">
                · {unassigned} need{unassigned === 1 ? "s" : ""} a tech
              </span>
            ) : null}
          </p>
        </div>
        <Link href="/dashboard/dispatch" className="pro-section-link">
          Board →
        </Link>
      </div>

      <ul className="pro-dispatch-today-list font-sans">
        {jobs.slice(0, 5).map((job) => {
          const who = job.customer?.name ?? job.lead?.name ?? "Customer";
          const emergency = job.urgency?.toLowerCase() === "emergency";

          return (
            <li key={job.id}>
              <Link href={`/dashboard/jobs/${job.id}`} className="pro-dispatch-today-row">
                <span className="pro-dispatch-today-time">{formatTime(job.scheduledAt)}</span>
                <span className="pro-dispatch-today-main">
                  <span className="pro-dispatch-today-job">{job.title}</span>
                  <span className="pro-dispatch-today-sub">
                    {who}
                    {job.technician?.name ? ` · ${job.technician.name}` : " · Unassigned"}
                  </span>
                </span>
                <span
                  className={`pro-dispatch-today-status ${
                    emergency ? "pro-dispatch-today-status-emergency" : ""
                  }`}
                >
                  {jobStatusLabel(job.status)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
