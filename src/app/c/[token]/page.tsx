"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import "@/app/public-field.css";

type Visit = {
  already: boolean;
  businessName: string;
  businessSlug: string | null;
  businessPhone: string | null;
  timezone: string | null;
  title: string;
  scheduledAt: string | null;
  jobStatus: string;
  technicianName: string | null;
  etaText: string | null;
  dispatchedAt: string | null;
  onSiteAt: string | null;
};

type ConfirmState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ({ status: "ok" } & Visit);

/* While the visit is live the page follows it, so a customer who keeps it open sees the tech arrive. */
const FOLLOW_MS = 30_000;
const LIVE = new Set(["scheduled", "confirmed", "en_route"]);

function formatWhen(iso: string, timezone: string | null) {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return new Date(iso).toLocaleString("en-US", { ...opts, timeZone: timezone ?? undefined });
  } catch {
    return new Date(iso).toLocaleString("en-US", opts);
  }
}

function formatClock(iso: string, timezone: string | null) {
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  try {
    return new Date(iso).toLocaleTimeString("en-US", { ...opts, timeZone: timezone ?? undefined });
  } catch {
    return new Date(iso).toLocaleTimeString("en-US", opts);
  }
}

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : raw;
}

function toVisit(data: { already?: boolean; job: Record<string, unknown> }): Visit {
  const job = data.job as Partial<Visit> & { businessName: string; title: string; status?: string };
  return {
    already: Boolean(data.already),
    businessName: job.businessName,
    businessSlug: job.businessSlug ?? null,
    businessPhone: job.businessPhone ?? null,
    timezone: job.timezone ?? null,
    title: job.title,
    scheduledAt: job.scheduledAt ?? null,
    jobStatus: job.status ?? "confirmed",
    technicianName: job.technicianName ?? null,
    etaText: job.etaText ?? null,
    dispatchedAt: job.dispatchedAt ?? null,
    onSiteAt: job.onSiteAt ?? null,
  };
}

function headline(v: Visit) {
  const who = v.technicianName ?? "Your technician";
  if (v.jobStatus === "on_site") return { kicker: "Arrived", title: `${who} is here` };
  if (v.jobStatus === "en_route") return { kicker: "On the way", title: `${who} is on the way` };
  return {
    kicker: v.already ? "Already confirmed" : "Confirmed",
    title: v.already ? "You're already confirmed" : "You're confirmed",
  };
}

function Steps({ v }: { v: Visit }) {
  const enRoute = v.jobStatus === "en_route";
  const arrived = v.jobStatus === "on_site";
  const left = v.dispatchedAt ? `Left at ${formatClock(v.dispatchedAt, v.timezone)}` : null;
  const steps = [
    { label: "Booked", detail: null, done: true },
    { label: "Confirmed", detail: v.scheduledAt ? formatWhen(v.scheduledAt, v.timezone) : null, done: true },
    {
      label: "On the way",
      detail: enRoute ? (v.etaText ? `Arriving in about ${v.etaText}` : left) : arrived ? left : null,
      done: arrived,
      now: enRoute,
    },
    {
      label: "Arrived",
      detail: arrived && v.onSiteAt ? `At ${formatClock(v.onSiteAt, v.timezone)}` : null,
      done: arrived,
    },
  ];
  return (
    <ol className="pf-steps" aria-label="Visit status">
      {steps.map((step) => (
        <li
          key={step.label}
          className={`pf-step${step.done ? " is-done" : ""}${step.now ? " is-now" : ""}`}
          aria-current={step.now ? "step" : undefined}
        >
          <span className="pf-step-dot" aria-hidden />
          <span className="pf-step-text">
            <span className="pf-step-label">{step.label}</span>
            {step.detail ? <span className="pf-step-detail">{step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function CustomerConfirmPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<ConfirmState>({ status: "loading" });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch(`/api/public/confirm/${token}`, {
          method: "POST",
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({
            status: "error",
            message: data.error ?? "This confirm link is invalid or expired.",
          });
          return;
        }
        setState({ status: "ok", ...toVisit(data) });
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Could not confirm right now. Try again in a moment.",
          });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const jobStatus = state.status === "ok" ? state.jobStatus : null;

  useEffect(() => {
    if (!token || !jobStatus || !LIVE.has(jobStatus)) return;
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/public/confirm/${token}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setState((prev) => (prev.status === "ok" ? { status: "ok", ...toVisit({ ...data, already: prev.already || data.already }) } : prev));
      } catch {
        /* the last good status stays on screen */
      }
    }, FOLLOW_MS);
    return () => window.clearInterval(id);
  }, [token, jobStatus]);

  return (
    <main className="pf pf--center">
      {state.status === "loading" ? <p className="pf-muted">Confirming your appointment…</p> : null}

      {state.status === "error" ? (
        <header className="pf-head">
          <h1 className="pf-title">Link not valid</h1>
          <p className="pf-sub">{state.message}</p>
        </header>
      ) : null}

      {state.status === "ok" ? <VisitView v={state} /> : null}
    </main>
  );
}

function VisitView({ v }: { v: Visit }) {
  const head = headline(v);
  const live = v.jobStatus === "en_route" || v.jobStatus === "on_site";
  return (
    <>
      <header className="pf-head">
        <p className="pf-kicker">{v.businessName}</p>
        <span className={`pf-pill${v.jobStatus === "en_route" ? "" : " is-done"}`}>{head.kicker}</span>
        <h1 className="pf-title">{head.title}</h1>
        {v.jobStatus === "en_route" && v.etaText ? <p className="pf-sub">Arriving in about {v.etaText}</p> : null}
      </header>
      <section className="pf-card">
        <Steps v={v} />
      </section>
      <dl className="pf-card">
        <div className="pf-row">
          <dt>Visit</dt>
          <dd>{v.title}</dd>
        </div>
        {v.scheduledAt ? (
          <div className="pf-row">
            <dt>When</dt>
            <dd>{formatWhen(v.scheduledAt, v.timezone)}</dd>
          </div>
        ) : null}
        {v.technicianName ? (
          <div className="pf-row">
            <dt>Technician</dt>
            <dd>{v.technicianName}</dd>
          </div>
        ) : null}
      </dl>
      {v.businessPhone ? (
        <a className="pf-action" href={`tel:${v.businessPhone}`}>
          <span className="pf-action-label">Call {v.businessName}</span>
          <span className="pf-action-detail">
            {formatPhone(v.businessPhone)} · {live ? "questions before they arrive" : "if plans change"}
          </span>
        </a>
      ) : (
        <p className="pf-muted">The shop has your confirmation. Reply to their text if plans change.</p>
      )}
      {v.businessSlug ? (
        <p className="pf-muted pf-foot">
          <a href={`/r/${encodeURIComponent(v.businessSlug)}?via=confirm`}>Answered by Orvius</a>
        </p>
      ) : null}
    </>
  );
}
