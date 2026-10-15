"use client";

import { JobBillSection, type JobBill } from "@/components/job-bill-section";
import { RecordFetchError, recordFailureFrom } from "@/lib/dashboard-fetch";
import { RecordLoadFailure } from "@/components/record-load-failure";
import { JobFieldPanel } from "@/components/job-field-panel";
import { JobMoneyPanel } from "@/components/job-money-panel";
import { OsShell } from "@/components/os-shell";
import {
  ShellAlert,
  ShellLoading,
  ShellPanel,
} from "@/components/shell-primitives";
import { WorkPanel } from "@/components/work-panel";
import { displayPhone } from "@/lib/customer";
import { PAST_DUE_LABEL, jobPastDue, nextJobStatus, pastDueDetail } from "@/lib/job-status";
import { jobLifecycle, jobSteps, type TextDelivery } from "@/lib/job-lifecycle";
import { StatusDot } from "@/components/status-dot";
import { formatShopTime, shopWallInput } from "@/lib/when";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

type Tech = { id: string; name: string; phone: string | null };

const WIDE = "(min-width: 1024px)";

/** Matches `.os-detail-grid`: with a side column, money sits beside the work; without one, above the history. */
function useWide() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

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
  customerConfirmSentAt?: string | null;
  customerConfirmFailedAt?: string | null;
  customerConfirmDelivery?: TextDelivery | null;
  techAssignedAt?: string | null;
  techNotifiedAt?: string | null;
  techAcceptedAt?: string | null;
  techDeclinedAt?: string | null;
  techDeclinedBy?: string | null;
  techDeclineReason?: string | null;
  createdAt: string;
  dispatchedAt: string | null;
  onSiteAt: string | null;
  completedAt: string | null;
  outcomeCapturedAt?: string | null;
  resolutionCode?: string | null;
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
  const [failure, setFailure] = useState<ReturnType<typeof recordFailureFrom> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [workVersion, setWorkVersion] = useState(0);
  const [changing, setChanging] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const wide = useWide();

  const load = useCallback(() => {
    if (!jobId) return;
    Promise.all([
      fetch(`/api/jobs/${jobId}`).then(async (res) => {
        if (!res.ok) throw new RecordFetchError(res.status);
        return res.json();
      }),
      fetch("/api/technicians")
        .then((res) => (res.ok ? res.json() : { technicians: [] }))
        .catch(() => ({ technicians: [] })),
    ])
      .then(([jobData, techData]) => {
        setJob(jobData.job);
        setDeposit(jobData.deposit ?? null);
        setDepositReadiness(jobData.depositReadiness ?? null);
        setBill({
          invoice: jobData.invoice ?? null,
          finalAmountCents: jobData.finalAmountCents ?? null,
          cardPayReady: Boolean(jobData.cardPayReady),
          salesTaxBps: Number(jobData.salesTaxBps) || 0,
        });
        setCrew(techData.technicians ?? []);
        setScheduleDraft(shopWallInput(jobData.job?.scheduledAt, jobData.job?.business?.timezone));
        setConfirmMsg(null);
        setFailure(null);
      })
      .catch((err) => setFailure(recordFailureFrom("job", err)))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    if (!jobId) return;
    const previous = job;
    /* The screen answers the tap at once; the server confirms after. */
    if (previous) setJob({ ...previous, ...body, technician: body.technicianId === undefined ? previous.technician : (crew.find((t) => t.id === body.technicianId) ?? null) });
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't go through — nothing changed");
      setJob(data.job);
      setWorkVersion((v) => v + 1);
    } catch (err) {
      if (previous) setJob(previous);
      setError(err instanceof Error ? err.message : "That didn't go through — nothing changed");
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
      <OsShell title="Job" subtitle={failure?.status === 404 ? "Not on this account" : "Couldn't load"}>
        <RecordLoadFailure
          failure={failure ?? recordFailureFrom("job", null)}
          backHref="/dashboard/jobs"
          backLabel="Jobs"
          onRetry={() => {
            setLoading(true);
            load();
          }}
        />
      </OsShell>
    );
  }

  const pastDue = jobPastDue(job);
  const next = pastDue ? null : nextJobStatus(job.status);
  const phone = job.customer?.phone ?? job.lead?.phone;
  const who = job.customer?.name ?? job.lead?.name ?? phone ?? null;
  const refreshWork = () => load();
  const tz = job.business?.timezone ?? null;
  const open = job.status !== "completed" && job.status !== "cancelled";
  const needsConfirm = open && Boolean(job.scheduledAt) && !job.customerConfirmedAt && job.status !== "confirmed";
  const lifecycle = jobLifecycle(job);
  const steps = job.status === "cancelled" ? [] : jobSteps(job);
  const techStep = steps.find((s) => s.key === "technician");
  const callTech = open && job.technician?.phone && techStep && techStep.state !== "done" ? job.technician.phone : null;
  const reasonBody = changeReason.trim() ? { reason: changeReason.trim() } : {};
  const whenNote =
    job.status === "completed"
      ? job.completedAt
        ? `Finished ${formatShopTime(job.completedAt, tz)}`
        : "Finished"
      : job.status === "cancelled"
        ? "Cancelled"
        : job.customerConfirmedAt
          ? "Customer confirmed"
          : job.status === "confirmed"
            ? "Marked confirmed by your team"
            : job.scheduledAt
              ? "Waiting for the customer to confirm"
              : "No time picked yet";

  function closeJob() {
    const reason = changeReason.trim() || window.prompt("Why is this job being cancelled? This goes in the history.")?.trim();
    if (reason === undefined) return;
    if (window.confirm("Cancel this job? The technician's day updates right away.")) {
      void patch({ status: "cancelled", ...(reason ? { reason } : {}) }).then(() => setChangeReason(""));
    }
  }

  function startReschedule() {
    setChanging(true);
    requestAnimationFrame(() => document.getElementById("job-reschedule")?.focus());
  }

  async function textConfirm() {
    if (!job) return;
    setConfirmBusy(true);
    setConfirmMsg(null);
    try {
      const res = await fetch(`/api/jobs/${job.id}/confirm-sms`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send");
      setConfirmMsg("Sent. You'll see their reply in the history.");
      setWorkVersion((v) => v + 1);
    } catch (err) {
      setConfirmMsg(err instanceof Error ? err.message : "Could not send the text.");
    } finally {
      setConfirmBusy(false);
    }
  }

  const side = (
    <>
      {job.customer || job.lead ? (
        <ShellPanel title="Customer" dense>
          <p className="jv-who font-sans">{job.customer?.name ?? job.lead?.name ?? (phone ? displayPhone(phone) : null)}</p>
          <p className="jv-sub font-sans">
            {[
              job.customer?.name ? displayPhone(job.customer.phone) : null,
              job.customer ? `${job.customer.interactionCount} interaction${job.customer.interactionCount === 1 ? "" : "s"}` : null,
              job.lead ? "booked from their request" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="jv-links font-sans">
            {job.customer ? <Link href={`/dashboard/customers/${job.customer.id}`}>Customer profile →</Link> : null}
            {job.lead ? <Link href={`/dashboard/inbox/${job.lead.id}`}>The request and call →</Link> : null}
          </div>
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
          jobClosed={!open}
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
    </>
  );

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
          <Link href="/dashboard/schedule" className="ox-btn ox-btn--quiet ox-btn--sm">
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
          <WorkPanel kind="job" id={job.id} onChange={refreshWork} refreshKey={workVersion} beforeHistory={wide ? null : side}>
            <ShellPanel
              title="Visit"
              dense
              action={
                open ? (
                  <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" aria-expanded={changing} onClick={() => setChanging((v) => !v)}>
                    {changing ? "Done" : "Change"}
                  </button>
                ) : null
              }
            >
              <dl className="jv-facts font-sans">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <StatusDot tone={lifecycle.tone}>{lifecycle.label}</StatusDot>
                    <span className="jv-sub">{lifecycle.detail}</span>
                  </dd>
                </div>
                <div>
                  <dt>When</dt>
                  <dd>
                    {job.scheduledAt ? formatShopTime(job.scheduledAt, tz) : "Not scheduled"}
                    <span className="jv-sub">{whenNote}</span>
                  </dd>
                </div>
                <div>
                  <dt>Technician</dt>
                  <dd>{job.technician?.name ?? "Nobody yet"}</dd>
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
                {job.notes ? (
                  <div>
                    <dt>Notes</dt>
                    <dd className="jv-notes">{job.notes}</dd>
                  </div>
                ) : null}
              </dl>

              {steps.length ? (
                <ol className="jv-steps font-sans" aria-label="Where this job stands">
                  {steps.map((step) => (
                    <li key={step.key} className={`jv-step is-${step.state}`}>
                      <span className="jv-step-mark" aria-hidden />
                      <span className="jv-step-body">
                        <span className="jv-step-label">
                          {step.label}
                          <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "problem" ? " (needs you)" : " (not yet)"}</span>
                        </span>
                        <span className="jv-sub">
                          {step.detail}
                          {step.at && step.state !== "waiting" ? ` · ${formatShopTime(step.at, tz)}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
              {callTech ? (
                <p className="jv-sub jv-msg">
                  <a href={`tel:${callTech}`}>Call {job.technician?.name}</a>
                </p>
              ) : null}

              {open && changing ? (
                <div className="jv-change font-sans">
                  <div className="jv-change-row">
                    <label className="jv-field">
                      <span className="label">Move to (shop clock)</span>
                      <input
                        id="job-reschedule"
                        type="datetime-local"
                        className="input"
                        disabled={saving}
                        value={scheduleDraft}
                        onChange={(e) => setScheduleDraft(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="ox-btn ox-btn--quiet ox-btn--sm"
                      disabled={saving || !scheduleDraft || scheduleDraft === shopWallInput(job.scheduledAt, tz)}
                      onClick={() =>
                        void patch({ scheduledLocal: scheduleDraft, ...reasonBody }).then(() => {
                          setChangeReason("");
                          setConfirmMsg("Moved. Text the customer so they confirm the new time.");
                        })
                      }
                    >
                      Move it
                    </button>
                  </div>
                  <label className="jv-field">
                    <span className="label">Technician</span>
                    <select
                      className="input"
                      disabled={saving}
                      value={job.technicianId ?? ""}
                      onChange={(e) => void patch({ technicianId: e.target.value || null, ...reasonBody }).then(() => setChangeReason(""))}
                    >
                      <option value="">Nobody yet</option>
                      {crew.map((tech) => (
                        <option key={tech.id} value={tech.id}>
                          {tech.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="jv-field">
                    <span className="label">Reason (kept in the history)</span>
                    <input
                      className="input"
                      disabled={saving}
                      value={changeReason}
                      maxLength={300}
                      placeholder="e.g. Customer asked for the afternoon"
                      onChange={(e) => setChangeReason(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={closeJob}
                    className="jv-cancel"
                  >
                    Cancel job
                  </button>
                </div>
              ) : null}

              {pastDue && job.scheduledAt ? (
                <div className="jv-recover font-sans" role="group" aria-label={PAST_DUE_LABEL}>
                  <p className="jv-recover-title">{PAST_DUE_LABEL}</p>
                  <p className="jv-sub">{pastDueDetail(job.scheduledAt)}</p>
                  <div className="jv-next">
                    {phone ? (
                      <a href={`tel:${phone}`} className="ox-btn ox-btn--primary">
                        Call the customer
                      </a>
                    ) : null}
                    <button type="button" className="ox-btn ox-btn--quiet" disabled={saving} onClick={startReschedule}>
                      Reschedule
                    </button>
                    <button type="button" className="ox-btn ox-btn--quiet" disabled={saving} onClick={closeJob}>
                      Close the job
                    </button>
                  </div>
                </div>
              ) : null}

              {open && !pastDue ? (
                <div className="jv-next">
                  {next?.status === "en_route" && !job.technician ? (
                    <button type="button" className="ox-btn ox-btn--primary" onClick={() => setChanging(true)}>
                      Assign a technician
                    </button>
                  ) : next ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void patch({ status: next.status })}
                      className={`ox-btn ox-btn--primary${saving ? " is-instant-pending" : ""}`}
                    >
                      {saving ? "Moving…" : next.label}
                    </button>
                  ) : null}
                  {needsConfirm ? (
                    <button type="button" className={`ox-btn ox-btn--quiet${confirmBusy ? " is-instant-pending" : ""}`} disabled={confirmBusy || saving} onClick={() => void textConfirm()}>
                      {confirmBusy ? "Sending…" : "Text customer to confirm"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {confirmMsg ? <p className="jv-sub jv-msg">{confirmMsg}</p> : null}
            </ShellPanel>
            <ShellPanel title="The work" dense>
              <JobFieldPanel jobId={job.id} locked={bill?.invoice?.status === "paid"} timezone={tz} onChange={load} />
            </ShellPanel>
          </WorkPanel>
        </div>

        {wide ? <div className="os-detail-side">{side}</div> : null}
      </div>

      {open ? (
        <div className="job-detail-sticky font-sans">
          <div className="job-detail-sticky-inner">
            {next?.status === "en_route" && !job.technician ? (
              <button type="button" className="job-detail-sticky-btn job-detail-sticky-btn-primary" onClick={() => setChanging(true)}>
                Assign a technician
              </button>
            ) : next ? (
              <button type="button" className="job-detail-sticky-btn job-detail-sticky-btn-primary" disabled={saving} onClick={() => void patch({ status: next.status })}>
                {saving ? "Moving…" : next.label}
              </button>
            ) : pastDue ? (
              <button type="button" className="job-detail-sticky-btn job-detail-sticky-btn-primary" disabled={saving} onClick={startReschedule}>
                Reschedule
              </button>
            ) : null}
            {phone ? (
              <a href={`tel:${phone}`} className="job-detail-sticky-btn job-detail-sticky-btn-muted">
                Call
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </OsShell>
  );
}
