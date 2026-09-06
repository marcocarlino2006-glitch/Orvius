"use client";

import { JobMoneyPanel } from "@/components/job-money-panel";
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
  customerConfirmedAt: string | null;
  dispatchedAt: string | null;
  onSiteAt: string | null;
  completedAt: string | null;
  technicianId: string | null;
  technician: Tech | null;
  business: { id: string; name: string; avgTicketCents: number | null } | null;
  estimate: {
    id: string;
    amountCents: number;
    status: string;
    invoice: {
      id: string;
      amountCents: number;
      status: string;
      payments: Array<{ id: string; amountCents: number; status: string }>;
    } | null;
  } | null;
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
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

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
        if (jobData.job?.scheduledAt) {
          const d = new Date(jobData.job.scheduledAt);
          const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
          setScheduleDraft(local);
        } else {
          setScheduleDraft("");
        }
        setConfirmMsg(null);
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

      <div className="os-detail-grid">
        <ShellPanel title="Field" dense>
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

          <dl className="os-kv font-sans">
            <div className="os-kv-block">
              <dt>When</dt>
              <dd>
                <p>
                  {job.scheduledAt
                    ? new Date(job.scheduledAt).toLocaleString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "Not scheduled"}
                </p>
                <p className="os-kv-note">
                  {job.customerConfirmedAt
                    ? `Customer confirmed ${new Date(job.customerConfirmedAt).toLocaleString()}`
                    : job.scheduledAt
                      ? "Proposed window — awaiting customer confirm"
                      : "No window proposed yet"}
                </p>
                <div className="os-kv-actions">
                  <label className="font-sans text-sm">
                    <span className="label">Reschedule</span>
                    <input
                      type="datetime-local"
                      className="input mt-1.5"
                      disabled={saving}
                      value={scheduleDraft}
                      onChange={(e) => setScheduleDraft(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    disabled={saving || !scheduleDraft}
                    onClick={() =>
                      void patch({
                        scheduledAt: scheduleDraft
                          ? new Date(scheduleDraft).toISOString()
                          : null,
                      }).then(() => {
                        setConfirmMsg(
                          "Window updated — send confirm so the customer locks it in.",
                        );
                      })
                    }
                  >
                    Save window
                  </button>
                  {job.scheduledAt && !job.customerConfirmedAt ? (
                    <button
                      type="button"
                      className="btn btn-void text-sm"
                      disabled={confirmBusy || saving}
                      onClick={() => {
                        void (async () => {
                          setConfirmBusy(true);
                          setConfirmMsg(null);
                          try {
                            const res = await fetch(
                              `/api/jobs/${job.id}/confirm-sms`,
                              { method: "POST" },
                            );
                            const data = await res.json();
                            if (!res.ok) {
                              throw new Error(data.error ?? "Could not send");
                            }
                            setConfirmMsg("Confirm SMS sent to customer.");
                          } catch (err) {
                            setConfirmMsg(
                              err instanceof Error
                                ? err.message
                                : "Could not send confirm SMS",
                            );
                          } finally {
                            setConfirmBusy(false);
                          }
                        })();
                      }}
                    >
                      {confirmBusy ? "Sending…" : "Text confirm"}
                    </button>
                  ) : null}
                </div>
                {confirmMsg ? (
                  <p className="os-kv-note">{confirmMsg}</p>
                ) : null}
              </dd>
            </div>
            {job.address ? (
              <div>
                <dt>Address</dt>
                <dd>{job.address}</dd>
              </div>
            ) : null}
            {job.serviceType ? (
              <div>
                <dt>Service</dt>
                <dd>{job.serviceType}</dd>
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

        <div className="os-detail-side">
          {job.customer ? (
            <ShellPanel title="Customer" dense>
              <p className="font-sans text-sm font-semibold tracking-[-0.02em] text-void">
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
            <ShellPanel title="From lead" dense>
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

          <ShellPanel title="Money" dense>
            <JobMoneyPanel
              jobId={job.id}
              avgTicketCents={job.business?.avgTicketCents ?? null}
              estimate={job.estimate}
              onRefresh={load}
            />
          </ShellPanel>

          {job.notes ? (
            <ShellPanel title="Notes" dense>
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
