"use client";

import { useCallback, useEffect, useState } from "react";
import { JOB_OUTCOMES, jobOutcomeLabel } from "@/lib/job-outcome";
import { isEmergency, notableUrgency } from "@/lib/urgency";
import "@/app/public-field.css";

type TechJob = {
  title: string;
  status: string;
  address: string | null;
  urgency: string | null;
  serviceType: string | null;
  notes: string | null;
  etaText: string | null;
  resolutionCode: string | null;
  resolutionSummary: string | null;
  finalAmountCents: number | null;
  scheduledAt: string | null;
  shopName: string;
  customerName: string | null;
  customerPhone: string | null;
  technicianName: string | null;
};

const ADVANCES: Record<string, { label: string; status: string } | null> = {
  scheduled: { label: "Confirm job", status: "confirmed" },
  confirmed: { label: "Heading there", status: "en_route" },
  en_route: { label: "I'm on site", status: "on_site" },
  on_site: { label: "Complete job", status: "completed" },
  completed: null,
  cancelled: null,
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  en_route: "On the way",
  on_site: "On site",
  completed: "Complete",
  cancelled: "Cancelled",
};

function phoneLabel(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

function whenLabel(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `Today · ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${time}`;
}

export function TechFieldClient({ token }: { token: string }) {
  const [job, setJob] = useState<TechJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etaText, setEtaText] = useState("");
  const [etaSaved, setEtaSaved] = useState(false);
  const [resolutionCode, setResolutionCode] = useState("");
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [finalAmount, setFinalAmount] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/tech/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Job not found");
      setJob(data.job);
      setEtaText(data.job.etaText ?? "");
      setResolutionCode(data.job.resolutionCode ?? "");
      setResolutionSummary(data.job.resolutionSummary ?? "");
      setFinalAmount(data.job.finalAmountCents != null ? String(data.job.finalAmountCents / 100) : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Job not found");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, string | number | null>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/tech/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setJob(data.job);
      if (data.job?.etaText != null) setEtaText(data.job.etaText);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="pf">
        <p className="pf-muted">Loading job…</p>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="pf">
        <h1 className="pf-title">Link not valid</h1>
        <p className="pf-muted">{error ?? "This job link is invalid or expired. Ask the office to resend it."}</p>
      </main>
    );
  }

  const next = ADVANCES[job.status] ?? null;
  const emergency = isEmergency(job.urgency);
  const urgency = notableUrgency(job.urgency);
  const when = whenLabel(job.scheduledAt);

  function completeWithOutcome() {
    if (!resolutionCode) {
      setError("Choose what happened before completing the job.");
      return;
    }
    const dollars = finalAmount.trim() ? Number(finalAmount) : null;
    if (dollars != null && (!Number.isFinite(dollars) || dollars < 0 || dollars > 50_000)) {
      setError("Final amount must be between $0 and $50,000.");
      return;
    }
    void patch({
      status: "completed",
      resolutionCode,
      resolutionSummary,
      finalAmountCents: dollars == null ? null : Math.round(dollars * 100),
    });
  }

  return (
    <main className="pf">
      <header className="pf-head">
        <p className="pf-kicker">{job.shopName}</p>
        <h1 className="pf-title">{job.title}</h1>
        <p className="pf-sub pf-meta">
          <span className={`pf-pill${emergency ? " is-risk" : job.status === "completed" ? " is-done" : ""}`}>
            {emergency ? "Emergency" : STATUS_LABEL[job.status] ?? job.status}
          </span>
          {[when, urgency].filter(Boolean).join(" · ")}
        </p>
      </header>

      {job.customerPhone || job.address ? (
        <div className="pf-actions">
          {job.customerPhone ? (
            <a className="pf-action" href={`tel:${job.customerPhone}`}>
              <span className="pf-action-label">Call</span>
              <span className="pf-action-detail">{job.customerName ?? phoneLabel(job.customerPhone)}</span>
            </a>
          ) : null}
          {job.address ? (
            <a
              className="pf-action"
              href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="pf-action-label">Directions</span>
              <span className="pf-action-detail">{job.address.split(",")[0]}</span>
            </a>
          ) : null}
        </div>
      ) : null}

      <dl className="pf-card">
        {job.customerName ? (
          <div className="pf-row">
            <dt>Customer</dt>
            <dd>{job.customerName}</dd>
          </div>
        ) : null}
        {job.customerPhone ? (
          <div className="pf-row">
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${job.customerPhone}`}>{phoneLabel(job.customerPhone)}</a>
            </dd>
          </div>
        ) : null}
        {job.address ? (
          <div className="pf-row">
            <dt>Address</dt>
            <dd>{job.address}</dd>
          </div>
        ) : null}
        {job.serviceType && job.serviceType !== job.title ? (
          <div className="pf-row">
            <dt>Request</dt>
            <dd>{job.serviceType}</dd>
          </div>
        ) : null}
        {job.notes ? (
          <div className="pf-row">
            <dt>Notes</dt>
            <dd>{job.notes}</dd>
          </div>
        ) : null}
      </dl>

      {job.status === "confirmed" || job.status === "en_route" ? (
        <form
          className="pf-card pf-eta"
          onSubmit={(e) => {
            e.preventDefault();
            setEtaSaved(false);
            void patch({ etaText }).then((ok) => setEtaSaved(ok));
          }}
        >
          <label className="pf-label" htmlFor="pf-eta">
            Arrival time for the customer
          </label>
          <div className="pf-inline">
            <input
              id="pf-eta"
              className="pf-input"
              value={etaText}
              onChange={(e) => {
                setEtaText(e.target.value);
                setEtaSaved(false);
              }}
              placeholder="e.g. 20 min"
              disabled={busy}
            />
            <button type="submit" className="pf-btn" disabled={busy || !etaText.trim()}>
              {etaSaved ? "Saved" : "Save"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="pf-error" role="alert">
          {error}
        </p>
      ) : null}

      {job.status === "on_site" ? (
        <section className="pf-card pf-outcome" aria-labelledby="pf-outcome-title">
          <h2 id="pf-outcome-title" className="pf-h2">
            Close out the job
          </h2>
          <label className="pf-label" htmlFor="pf-outcome">
            What happened?
          </label>
          <select
            id="pf-outcome"
            className="pf-input"
            value={resolutionCode}
            onChange={(event) => setResolutionCode(event.target.value)}
            disabled={busy}
          >
            <option value="">Choose one</option>
            {JOB_OUTCOMES.map((outcome) => (
              <option key={outcome.code} value={outcome.code}>
                {outcome.label}
              </option>
            ))}
          </select>
          <label className="pf-label" htmlFor="pf-summary">
            What fixed it? <em>Optional</em>
          </label>
          <textarea
            id="pf-summary"
            className="pf-input"
            value={resolutionSummary}
            onChange={(event) => setResolutionSummary(event.target.value)}
            placeholder="e.g. Replaced failed 45/5 capacitor"
            maxLength={500}
            rows={3}
            disabled={busy}
          />
          <label className="pf-label" htmlFor="pf-amount">
            Final amount <em>Optional</em>
          </label>
          <div className="pf-money">
            <span aria-hidden>$</span>
            <input
              id="pf-amount"
              className="pf-input"
              type="number"
              min="0"
              max="50000"
              step="0.01"
              inputMode="decimal"
              value={finalAmount}
              onChange={(event) => setFinalAmount(event.target.value)}
              placeholder="0.00"
              disabled={busy}
            />
          </div>
        </section>
      ) : null}

      {job.status === "completed" ? (
        <section className="pf-card pf-done">
          <p className="pf-h2">Job complete</p>
          {job.resolutionCode ? (
            <p className="pf-muted">
              {jobOutcomeLabel(job.resolutionCode)}
              {job.resolutionSummary ? ` · ${job.resolutionSummary}` : ""}
              {job.finalAmountCents != null ? ` · $${(job.finalAmountCents / 100).toFixed(2)}` : ""}
            </p>
          ) : null}
        </section>
      ) : null}

      {job.status === "on_site" || next ? (
        <div className="pf-dock">
          <button
            type="button"
            className="pf-btn pf-btn--primary"
            disabled={busy}
            onClick={() => (job.status === "on_site" ? completeWithOutcome() : void patch({ status: next!.status }))}
          >
            {busy ? "Updating…" : job.status === "on_site" ? "Complete job" : next!.label}
          </button>
        </div>
      ) : null}
    </main>
  );
}
