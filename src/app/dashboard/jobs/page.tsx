"use client";

import { JobCard } from "@/components/job-card";
import {
  ProRingBanner,
  ProStatRow,
  ProEmptyState,
} from "@/components/pro-page-chrome";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { ShellAlert } from "@/components/shell-primitives";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

  const stats = useMemo(() => {
    const active = jobs.filter(
      (j) => !["completed", "cancelled"].includes(j.status),
    ).length;
    const today = jobs.filter((j) => {
      if (!j.scheduledAt) return false;
      const d = new Date(j.scheduledAt);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }).length;
    const emergency = jobs.filter((j) =>
      j.urgency?.toLowerCase().includes("emergency"),
    ).length;

    return [
      { label: "Total jobs", value: jobs.length },
      { label: "Active", value: active, highlight: active > 0 },
      { label: "Today", value: today, highlight: today > 0 },
      { label: "Emergency", value: emergency, highlight: emergency > 0 },
    ];
  }, [jobs]);

  return (
    <OsShell
      title="Jobs"
      subtitle="Book from the inbox. Track every appointment in one place."
      actions={
        <Link href="/dashboard/dispatch" className="btn btn-void text-sm">
          Dispatch
        </Link>
      }
    >
      <PlanUpgradeGate module="jobs">
      <ProRingBanner
        name="Scheduled work"
        description="Turn qualified leads into booked jobs — then assign crew on the dispatch board."
        live
      />

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <ProStatRow stats={stats} className="mb-6" />

          {error ? (
            <div className="mb-6">
              <ShellAlert tone="error">{error}</ShellAlert>
            </div>
          ) : null}

          {!jobs.length ? (
            <ProEmptyState
              title="No jobs booked yet"
              body="Open a lead in the inbox, capture the details, and book the appointment."
              action={
                <Link href="/dashboard/inbox" className="btn btn-void text-sm">
                  Go to inbox
                </Link>
              }
            />
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
      </PlanUpgradeGate>
    </OsShell>
  );
}
