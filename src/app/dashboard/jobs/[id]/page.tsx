"use client";

import { JobBillSection, type JobBill } from "@/components/job-bill-section";
import { JobFieldPanel } from "@/components/job-field-panel";
import { JobMoneyPanel } from "@/components/job-money-panel";
import { OsShell } from "@/components/os-shell";
import {
  ShellAlert,
  ShellLoading,
  ShellPanel,
} from "@/components/shell-primitives";
import { WorkPanel } from "@/components/work-panel";
import { nextJobStatus } from "@/lib/job-status";
import { formatShopTime, shopWallInput } from "@/lib/when";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Tech = { id: string; name: string; phone: string | null };

type DepositState = {
  id: string;
  amountCents: number;
  status: string;
  payUrl: string | null;
  sentAt: string | null;
  paidAt: string | null;
} | null;

type DepositReadiness =
  | { ready: true; amountCents: number }
  | { ready: false; reason: "connect_incomplete" | "deposits_off" };

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
  business: { id: string; name: string; timezone: string | null; avgTicketCents: number | null } | null;
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
  /*
    Deposit state is kept out of `job` on purpose — the PATCH response carries
    a job without it, so folding the two together would blank the deposit
    every time the owner changed a status or a technician.
  */
  const [deposit, setDeposit] = useState<DepositState>(null);
  const [depositReadiness, setDepositReadiness] =
    useState<DepositReadiness | null>(null);
  const [bill, setBill] = useState<JobBill | null>(null);
  const [crew, setCrew] = useState<Tech[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [workVersion, setWorkVersion] = useState(0);

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
        setDeposit(jobData.deposit ?? null);
        setDepositReadiness(jobData.depositReadiness ?? null);
        setBill({
          invoice: jobData.invoice ?? null,
          finalAmountCents: jobData.finalAmountCents ?? null,
          cardPayReady: Boolean(jobData.cardPayReady),
        });
        setCrew(techData.technicians ?? []);
        setScheduleDraft(shopWallInput(jobData.job?.scheduledAt, jobData.job?.business?.timezone));
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
      setWorkVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <OsShell title="Job" subtitle="Loading…">
        <ShellLoading />
      </OsShell>
    );
  }

  if (!job) {
    return (
      <OsShell title="Job" subtitle="Not found">
        <ShellAlert tone="error">{error ?? "Not found"}</ShellAlert>
        <Link href="/dashboard/work" className="customer-timeline-link mt-4 inline-block font-sans">
          ← Work
        </Link>
      </OsShell>
    );
  }

  const next = nextJobStatus(job.status);
  const phone = job.customer?.phone ?? job.lead?.phone;
  const who = job.customer?.name ?? job.lead?.name ?? phone ?? null;
  const refreshWork = () => load();

  return (
    <OsShell
      title={job.title}
      subtitle={[who, job.address].filter(Boolean).join(" · ") || "Job"}
      businessName={job.business?.name ?? undefined}
      actions={
        <div className="flex flex-wrap gap-2">
          {phone ? (
            <>
              <a href={`tel:${phone}`} className="ox-btn ox-btn--quiet ox-btn--sm">
                Call
              </a>
              <a href={`sms:${phone}`} className="ox-btn ox-btn--quiet ox-btn--sm">
                Text
              </a>
            </>
          ) : null}
          <Link href="/dashboard/dispatch" className="ox-btn ox-btn--quiet ox-btn--sm">
            Schedule
          </Link>
        </div>
      }
    >
      {error ? (
        <div className="mb-6">
          <ShellAlert tone="error">{error}</ShellAlert>
        </div>
      ) : null}

      <div className="os-detail-grid">
        <div className="os-detail-primary">
        <WorkPanel kind="job" id={job.id} onChange={refreshWork} refreshKey={workVersion}>
        <ShellPanel title="Details" dense>
          <dl className="os-kv font-sans">
            <div className="os-kv-block">
              <dt>When</dt>
              <dd>
                <p>
                  {job.scheduledAt ? formatShopTime(job.scheduledAt, job.business?.timezone) : "Not scheduled"}
                </p>
                <p className="os-kv-note">
                  {job.status === "completed"
                    ? job.completedAt
                      ? `Finished ${formatShopTime(job.completedAt, job.business?.timezone)}`
                      : "Finished"
                    : job.status === "cancelled"
                      ? "Cancelled"
                      : job.customerConfirmedAt
                    ? `Customer confirmed ${formatShopTime(job.customerConfirmedAt, job.business?.timezone)}`
                    : job.status === "confirmed"
                      ? "Confirmed with the customer"
                      : job.scheduledAt
                      ? "Proposed window — awaiting customer confirm"
                      : "No window proposed yet"}
                </p>
                {job.status !== "completed" && job.status !== "cancelled" ? (
                <div className="os-kv-actions">
                  <label className="font-sans text-sm">
                    <span className="label">Move to (shop clock)</span>
                    <input
                      id="job-reschedule"
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
                      void patch({ scheduledLocal: scheduleDraft }).then(() => {
                        setConfirmMsg(
                          "Window updated — send confirm so the customer locks it in.",
                        );
                      })
                    }
                  >
                    Save window
                  </button>
                  {job.scheduledAt && !job.customerConfirmedAt && job.status !== "confirmed" ? (
                    <button
                      type="button"
                      className="btn btn-secondary text-sm"
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
                ) : null}
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
        <ShellPanel title="The work" dense>
          <JobFieldPanel jobId={job.id} locked={bill?.invoice?.status === "paid"} onChange={load} />
        </ShellPanel>
        </WorkPanel>
        </div>

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
            <ShellPanel title="Where it came from" dense>
              <p className="font-sans text-sm text-ash">
                {job.lead.name ? `Booked from ${job.lead.name}’s request.` : "Booked from a request."}
              </p>
              <Link
                href={`/dashboard/inbox/${job.lead.id}`}
                className="customer-timeline-link mt-3 inline-block font-sans"
              >
                Open the request and call →
              </Link>
            </ShellPanel>
          ) : null}

          <ShellPanel title="Money" dense>
            <JobMoneyPanel
              jobId={job.id}
              avgTicketCents={job.business?.avgTicketCents ?? null}
              estimate={job.estimate}
              leadId={job.lead?.id ?? null}
              customerPhone={job.lead?.phone ?? job.customer?.phone ?? null}
              deposit={deposit}
              depositReadiness={depositReadiness}
              jobClosed={job.status === "completed" || job.status === "cancelled"}
              onRefresh={load}
            />
            {bill ? (
              <JobBillSection
                key={bill.invoice?.id ?? "new"}
                jobId={job.id}
                bill={bill}
                defaultCents={job.estimate?.amountCents ?? null}
                depositPaidCents={deposit?.status === "paid" ? deposit.amountCents : 0}
                customerPhone={job.lead?.phone ?? job.customer?.phone ?? null}
                onRefresh={load}
              />
            ) : null}
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
