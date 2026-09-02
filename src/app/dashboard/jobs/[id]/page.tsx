"use client";

import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellBadge, ShellPanel } from "@/components/shell-primitives";
import { jobStatusLabel, nextJobStatus } from "@/lib/job-status";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Tech = { id: string; name: string; phone: string | null };

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
  dispatchedAt: string | null;
  onSiteAt: string | null;
  completedAt: string | null;
  technicianId: string | null;
  technician: Tech | null;
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

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;
  const [job, setJob] = useState<JobDetail | null>(null);
  const [crew, setCrew] = useState<Tech[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!jobId) return;
    Promise.all([
      fetch(`/api/jobs/${jobId}`).then(async (res) => {
        if (!res.ok) throw new Error("Job not found");
        return res.json();
      }),
      fetch("/api/technicians").then((res) => res.json()),
    ])
      .then(([jobData, techData]) => {
        setJob(jobData.job);
        setCrew(techData.technicians ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    if (!jobId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setJob(data.job);
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

  const next = nextJobStatus(job.status);
  const phone = job.customer?.phone ?? job.lead?.phone;

  return (
    <OsShell
      title={job.title}
      subtitle={`Job · ${job.business?.name ?? "Orvius"}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/dispatch" className="btn btn-void text-sm">
            Dispatch
          </Link>
          {phone ? (
            <a href={`tel:${phone}`} className="btn btn-void text-sm">
              Call customer
            </a>
          ) : null}
        </div>
      }
    >
      {error ? (
        <div className="mb-6">
          <ShellAlert tone="error">{error}</ShellAlert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ShellPanel title="Field">
          <div className="flex flex-wrap gap-2">
            <ShellBadge
              tone={
                job.status === "en_route" || job.status === "on_site" ? "live" : "flare"
              }
            >
              {jobStatusLabel(job.status)}
            </ShellBadge>
            {job.urgency ? (
              <ShellBadge tone="neutral">{job.urgency.replace(/-/g, " ")}</ShellBadge>
            ) : null}
            {job.technician ? (
              <ShellBadge tone="live">{job.technician.name}</ShellBadge>
            ) : (
              <ShellBadge tone="neutral">Unassigned</ShellBadge>
            )}
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

          <label className="mt-6 block font-sans">
            <span className="label">Assign technician</span>
            <select
              className="input mt-1.5"
              disabled={saving}
              value={job.technicianId ?? ""}
              onChange={(e) => patch({ technicianId: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {crew.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-6 flex flex-wrap gap-3">
            {next ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => patch({ status: next.status })}
                className="btn btn-void text-sm"
              >
                {saving ? "Saving…" : next.label}
              </button>
            ) : null}
            {job.status !== "cancelled" && job.status !== "completed" ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => patch({ status: "cancelled" })}
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
