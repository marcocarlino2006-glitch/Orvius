"use client";

import { useCallback, useEffect, useState } from "react";

type TechJob = {
  title: string;
  status: string;
  address: string | null;
  urgency: string | null;
  serviceType: string | null;
  notes: string | null;
  etaText: string | null;
  scheduledAt: string | null;
  shopName: string;
  customerName: string | null;
  customerPhone: string | null;
  technicianName: string | null;
};

const ADVANCES: Record<string, { label: string; status: string } | null> = {
  scheduled: { label: "Confirm job", status: "confirmed" },
  confirmed: { label: "En route", status: "en_route" },
  en_route: { label: "On site", status: "on_site" },
  on_site: { label: "Complete job", status: "completed" },
  completed: null,
  cancelled: null,
};

export function TechFieldClient({ token }: { token: string }) {
  const [job, setJob] = useState<TechJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etaText, setEtaText] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/tech/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Job not found");
      setJob(data.job);
      setEtaText(data.job.etaText ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Job not found");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, string>) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="tech-field-muted font-sans">Loading job…</p>;
  }

  if (!job) {
    return (
      <p className="tech-field-error font-sans">
        {error ?? "This field link is invalid or expired."}
      </p>
    );
  }

  const next = ADVANCES[job.status] ?? null;

  return (
    <div className="tech-field font-sans">
      <p className="tech-field-shop">{job.shopName}</p>
      <h1 className="tech-field-title">{job.title}</h1>
      <p className="tech-field-status">Status · {job.status.replace(/_/g, " ")}</p>

      <dl className="tech-field-meta">
        {job.customerName ? (
          <div>
            <dt>Customer</dt>
            <dd>{job.customerName}</dd>
          </div>
        ) : null}
        {job.customerPhone ? (
          <div>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${job.customerPhone}`}>{job.customerPhone}</a>
            </dd>
          </div>
        ) : null}
        {job.address ? (
          <div>
            <dt>Address</dt>
            <dd>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                target="_blank"
                rel="noreferrer"
              >
                {job.address}
              </a>
            </dd>
          </div>
        ) : null}
        {job.urgency ? (
          <div>
            <dt>Urgency</dt>
            <dd>{job.urgency}</dd>
          </div>
        ) : null}
        {job.notes ? (
          <div>
            <dt>Notes</dt>
            <dd>{job.notes}</dd>
          </div>
        ) : null}
      </dl>

      {error ? <p className="tech-field-error">{error}</p> : null}

      {job.status === "confirmed" || job.status === "en_route" ? (
        <label className="tech-field-eta">
          <span>ETA</span>
          <input
            value={etaText}
            onChange={(e) => setEtaText(e.target.value)}
            placeholder="e.g. 20 min"
            disabled={busy}
          />
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={busy}
            onClick={() => void patch({ etaText })}
          >
            Save ETA
          </button>
        </label>
      ) : null}

      {next ? (
        <button
          type="button"
          className="btn btn-void tech-field-advance"
          disabled={busy}
          onClick={() => void patch({ status: next.status })}
        >
          {busy ? "Updating…" : next.label}
        </button>
      ) : job.status === "completed" ? (
        <p className="tech-field-ok">Job complete.</p>
      ) : null}
    </div>
  );
}
