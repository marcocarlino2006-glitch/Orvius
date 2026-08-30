"use client";

import { JobCard } from "@/components/job-card";
import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellEmpty } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import Link from "next/link";
import { useEffect, useState } from "react";

type JobRow = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  address: string | null;
  urgency: string | null;
  customer: { name: string | null; phone: string } | null;
  lead: { name: string | null; phone: string | null } | null;
  technician?: { name: string } | null;
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/jobs")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load jobs");
        return res.json();
      })
      .then((data) => setJobs(data.jobs ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <OsShell
      title="Jobs"
      subtitle="Ring 3 — leads become booked appointments, not sticky notes."
      actions={
        <Link href="/dashboard/dispatch" className="btn btn-secondary text-sm">
          Dispatch board
        </Link>
      }
    >
      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {error ? (
            <div className="mb-6">
              <ShellAlert tone="error">{error}</ShellAlert>
            </div>
          ) : null}

          {!jobs.length ? (
            <ShellEmpty>
              No jobs yet. Open a lead in the inbox and book it onto the calendar.
            </ShellEmpty>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {jobs.map((job) => (
                <li key={job.id}>
                  <JobCard
                    id={job.id}
                    title={job.title}
                    status={job.status}
                    scheduledAt={job.scheduledAt}
                    address={job.address}
                    urgency={job.urgency}
                    customerName={job.customer?.name ?? job.lead?.name}
                    phone={job.customer?.phone ?? job.lead?.phone}
                    technicianName={job.technician?.name}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </OsShell>
  );
}
