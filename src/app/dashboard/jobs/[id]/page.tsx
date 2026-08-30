"use client";

import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellBadge, ShellPanel } from "@/components/shell-primitives";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type JobDetail = {
  id: string;
  title: string;
  status: string;
  serviceType: string | null;
  urgency: string | null;
  address: string | null;
  notes: string | null;
  scheduledAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  business: { id: string; name: string } | null;
  customer: {
    id: string;
    name: string | null;
    phone: string;
    address: string | null;
    interactionCount: number;
  } | null;
  lead: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
};

const NEXT_STATUS: Record<string, { label: string; status: string } | null> = {
  scheduled: { label: "Confirm job", status: "confirmed" },
  confirmed: { label: "Mark complete", status: "completed" },
  completed: null,
  cancelled: null,
};

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!jobId) return;
    fetch(`/api/jobs/${jobId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Job not found");
        return res.json();
      })
      .then((data) => setJob(data.job))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(status: string) {
    if (!jobId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setJob((current) => (current ? { ...current, ...data.job } : data.job));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <OsShell title="Job" subtitle="Loading…">
        <p className="font-sans text-sm text-ash">Loading…</p>
      </OsShell>
    );
  }

  if (!job) {
    return (
      <OsShell title="Job" subtitle="Not found">
        <ShellAlert tone="error">{error ?? "Not found"}</ShellAlert>
        <Link href="/dashboard/jobs" className="customer-timeline-link mt-4 inline-block font-sans">
          ← Jobs
        </Link>
      </OsShell>
    );
  }

  const next = NEXT_STATUS[job.status] ?? null;
  const phone = job.customer?.phone ?? job.lead?.phone;

  return (
    <OsShell
      title={job.title}
      subtitle={`Job · ${job.business?.name ?? "Orvius"}`}
      actions={
        phone ? (
          <a href={`tel:${phone}`} className="btn btn-primary text-sm">
            Call customer
          </a>
        ) : null
      }
    >
      {error ? (
        <div className="mb-6">
          <ShellAlert tone="error">{error}</ShellAlert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ShellPanel title="Schedule">
          <div className="flex flex-wrap gap-2">
            <ShellBadge tone={job.status === "confirmed" ? "live" : "flare"}>
              {job.status}
            </ShellBadge>
            {job.urgency ? (
              <ShellBadge tone="neutral">{job.urgency.replace(/-/g, " ")}</ShellBadge>
            ) : null}
          </div>

          <dl className="mt-6 space-y-4 font-sans text-sm">
            <div>
              <dt className="text-ash">When</dt>
              <dd className="mt-1 font-medium text-void">
                {job.scheduledAt
                  ? new Date(job.scheduledAt).toLocaleString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "Not scheduled"}
              </dd>
            </div>
            {job.address ? (
              <div>
                <dt className="text-ash">Address</dt>
                <dd className="mt-1 font-medium text-void">{job.address}</dd>
              </div>
            ) : null}
            {job.serviceType ? (
              <div>
                <dt className="text-ash">Service</dt>
                <dd className="mt-1 text-void">{job.serviceType}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            {next ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setStatus(next.status)}
                className="btn btn-primary text-sm"
              >
                {saving ? "Saving…" : next.label}
              </button>
            ) : null}
            {job.status !== "cancelled" && job.status !== "completed" ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setStatus("cancelled")}
                className="btn btn-secondary text-sm"
              >
                Cancel job
              </button>
            ) : null}
          </div>
        </ShellPanel>

        <div className="space-y-6">
          {job.customer ? (
            <ShellPanel title="Customer">
              <p className="font-serif text-lg tracking-[-0.03em] text-void">
                {job.customer.name ?? job.customer.phone}
              </p>
              <p className="mt-1 font-sans text-sm text-ash">
                {job.customer.interactionCount} interaction
                {job.customer.interactionCount === 1 ? "" : "s"}
              </p>
              <Link
                href={`/dashboard/customers/${job.customer.id}`}
                className="customer-timeline-link mt-3 inline-block font-sans"
              >
                Open customer →
              </Link>
            </ShellPanel>
          ) : null}

          {job.lead ? (
            <ShellPanel title="From lead">
              <p className="font-sans text-sm text-ash">
                Booked from {job.lead.name ?? job.lead.phone ?? "inbox lead"}.
              </p>
              <Link
                href={`/dashboard/inbox/${job.lead.id}`}
                className="customer-timeline-link mt-3 inline-block font-sans"
              >
                View lead →
              </Link>
            </ShellPanel>
          ) : null}

          {job.notes ? (
            <ShellPanel title="Notes">
              <p className="font-sans text-sm leading-relaxed text-void whitespace-pre-wrap">
                {job.notes}
              </p>
            </ShellPanel>
          ) : null}
        </div>
      </div>
    </OsShell>
  );
}
